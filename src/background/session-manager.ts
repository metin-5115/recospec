import type { CaptureConfig, Session, SessionMeta } from '@shared/types/session'
import {
  createSession,
  updateSession,
  getSession,
  listSessionsByState,
  deleteSession,
} from '@storage/session-repo'
import { sendToTab, broadcastToUI } from '@shared/messaging/send'
import { reinjectContentScript, resetReinjectAttempts } from './content-injector'
import { logger } from '@shared/logger'
import { SESSION_NAME_PREFIX } from '@shared/constants'

let activeSessionId: string | null = null
let activeTabId: number | null = null
let restored: Promise<void> | null = null

async function loadActiveSession(): Promise<void> {
  const recording = await listSessionsByState('recording')
  if (recording.length > 0) {
    activeSessionId = recording[0].sessionId
    activeTabId = recording[0].tabId ?? null
    logger.info('[BG] Restored active session', activeSessionId)
  }
}

/**
 * Re-hydrates the active session from Dexie. The module-level ids are only a cache: a
 * message that wakes a suspended service worker can reach a handler before this finishes,
 * so every handler awaits {@link whenSessionRestored} first.
 */
export function restoreActiveSession(): Promise<void> {
  restored = loadActiveSession()
  return restored
}

/**
 * Resolves once the active session has been read back from Dexie, starting the restore if
 * nothing has yet. Never rejects: if the restore fails, handlers proceed with no active
 * session (the failure itself is reported by whoever called {@link restoreActiveSession}).
 */
export async function whenSessionRestored(): Promise<void> {
  await (restored ?? restoreActiveSession()).catch(() => undefined)
}

export async function startSession(
  tabId: number,
  metadata: SessionMeta,
  config: CaptureConfig,
): Promise<void> {
  await whenSessionRestored()
  if (activeSessionId) {
    // Service worker may have restored a stale 'recording' session from DB after
    // being terminated. Archive it so the user can start fresh without reloading.
    logger.warn('[BG] Archiving stale session to allow new recording', activeSessionId)
    await updateSession(activeSessionId, { state: 'archived' }).catch(() => undefined)
    if (activeTabId !== null) {
      await sendToTab(activeTabId, { type: 'STOP_CAPTURE', sessionId: activeSessionId }).catch(
        () => undefined,
      )
    }
    activeSessionId = null
    activeTabId = null
  }

  const sessionId = crypto.randomUUID()
  const now = Date.now()
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  const startUrl = tab?.url ?? ''
  const session: Session = {
    sessionId,
    name: `${SESSION_NAME_PREFIX} ${new Date(now).toLocaleString()}`,
    state: 'recording',
    startUrl,
    startedAt: now,
    tabId,
    metadata,
    config,
    iterationNumber: 1,
    // Placeholder signature — recomputed by event-aggregator once
    // ITERATION_SIGNATURE_STEPS steps have been captured.
    flowSignature: `pending::${startUrl}`,
  }

  await createSession(session)
  activeSessionId = sessionId
  activeTabId = tabId

  await sendToTab(tabId, { type: 'START_CAPTURE', sessionId, config }).catch(async (err) => {
    logger.warn('[BG] START_CAPTURE failed — content script may have crashed, re-injecting', err)
    await reinjectContentScript(tabId)
    // Retry once after re-injection
    await sendToTab(tabId, { type: 'START_CAPTURE', sessionId, config }).catch((err2) =>
      logger.error('[BG] START_CAPTURE still failed after re-inject', err2),
    )
  })

  await broadcastToUI({ type: 'SESSION_STATE_CHANGED', session })

  await chrome.action.setBadgeText({ text: 'REC' }).catch(() => undefined)
  await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' }).catch(() => undefined)

  logger.info('[BG] Session started', sessionId)
}

export async function stopSession(sessionId: string): Promise<void> {
  await whenSessionRestored()
  if (activeSessionId !== sessionId) {
    logger.warn('[BG] Stop requested for unknown session', sessionId)
    return
  }

  const now = Date.now()
  await updateSession(sessionId, { state: 'stopped', stoppedAt: now })

  if (activeTabId !== null) {
    await sendToTab(activeTabId, { type: 'STOP_CAPTURE', sessionId }).catch((err) =>
      logger.error('[BG] Failed to send STOP_CAPTURE', err),
    )
  }

  const stopped = await getSession(sessionId)
  if (stopped) {
    await broadcastToUI({ type: 'SESSION_STATE_CHANGED', session: stopped })
  }

  if (activeTabId !== null) resetReinjectAttempts(activeTabId)
  activeSessionId = null
  activeTabId = null

  await chrome.action.setBadgeText({ text: '' }).catch(() => undefined)

  logger.info('[BG] Session stopped', sessionId)
}

export async function pauseSession(sessionId: string): Promise<void> {
  await whenSessionRestored()
  if (activeSessionId !== sessionId) {
    logger.warn('[BG] Pause requested for unknown session', sessionId)
    return
  }

  await updateSession(sessionId, { state: 'paused' })

  if (activeTabId !== null) {
    await sendToTab(activeTabId, { type: 'STOP_CAPTURE', sessionId }).catch((err) =>
      logger.error('[BG] Failed to send STOP_CAPTURE on pause', err),
    )
  }

  const paused = await getSession(sessionId)
  if (paused) await broadcastToUI({ type: 'SESSION_STATE_CHANGED', session: paused })

  await chrome.action.setBadgeText({ text: 'PAUSE' }).catch(() => undefined)
  await chrome.action.setBadgeBackgroundColor({ color: '#d97706' }).catch(() => undefined)

  logger.info('[BG] Session paused', sessionId)
}

export async function resumeSession(sessionId: string): Promise<void> {
  await whenSessionRestored()
  if (activeSessionId !== sessionId) {
    logger.warn('[BG] Resume requested for unknown session', sessionId)
    return
  }

  const session = await getSession(sessionId)
  if (!session || session.state !== 'paused') return

  await updateSession(sessionId, { state: 'recording' })

  if (activeTabId !== null) {
    await sendToTab(activeTabId, {
      type: 'START_CAPTURE',
      sessionId,
      config: session.config,
    }).catch((err) => logger.error('[BG] Failed to send START_CAPTURE on resume', err))
  }

  const resumed = await getSession(sessionId)
  if (resumed) await broadcastToUI({ type: 'SESSION_STATE_CHANGED', session: resumed })

  await chrome.action.setBadgeText({ text: 'REC' }).catch(() => undefined)
  await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' }).catch(() => undefined)

  logger.info('[BG] Session resumed', sessionId)
}

export async function deleteSessionById(sessionId: string): Promise<void> {
  await whenSessionRestored()
  if (activeSessionId === sessionId) {
    if (activeTabId !== null) {
      await sendToTab(activeTabId, { type: 'STOP_CAPTURE', sessionId }).catch(() => undefined)
      resetReinjectAttempts(activeTabId)
    }
    activeSessionId = null
    activeTabId = null
    await chrome.action.setBadgeText({ text: '' }).catch(() => undefined)
  }

  await deleteSession(sessionId)
  await broadcastToUI({ type: 'SESSION_DELETED', sessionId })

  logger.info('[BG] Session deleted', sessionId)
}

export async function renameSessionById(sessionId: string, name: string): Promise<void> {
  await updateSession(sessionId, { name })

  const updated = await getSession(sessionId)
  if (updated) await broadcastToUI({ type: 'SESSION_STATE_CHANGED', session: updated })

  logger.info('[BG] Session renamed', sessionId, name)
}

/**
 * A content script in `tabId` just (re)loaded and is listening. If that tab
 * owns the active recording session AND the session is still in the `recording`
 * state (not paused/stopped), re-send `START_CAPTURE` so capture resumes on the
 * new page. This is the recovery path for full-page navigations: the declarative
 * content script reloads fresh on every navigation and would otherwise never
 * learn that a recording is in progress.
 */
export async function resumeCaptureOnReady(tabId: number): Promise<void> {
  await whenSessionRestored()
  if (!activeSessionId || activeTabId !== tabId) return

  const session = await getSession(activeSessionId)
  if (!session || session.state !== 'recording') return

  await sendToTab(tabId, {
    type: 'START_CAPTURE',
    sessionId: activeSessionId,
    config: session.config,
  }).catch((err) => logger.warn('[BG] Failed to resume capture after navigation', err))

  logger.info('[BG] Resumed capture after navigation', activeSessionId, 'tab', tabId)
}

export function getActiveSessionId(): string | null {
  return activeSessionId
}

export function getActiveTabId(): number | null {
  return activeTabId
}
