import type { CaptureConfig, Session, SessionMeta } from '@shared/types/session'
import {
  createSession,
  updateSession,
  getSession,
  listSessionsByState,
} from '@storage/session-repo'
import { sendToTab, broadcastToUI } from '@shared/messaging/send'
import { logger } from '@shared/logger'
import { SESSION_NAME_PREFIX } from '@shared/constants'

let activeSessionId: string | null = null
let activeTabId: number | null = null

export async function restoreActiveSession(): Promise<void> {
  const recording = await listSessionsByState('recording')
  if (recording.length > 0) {
    activeSessionId = recording[0].sessionId
    activeTabId = recording[0].tabId ?? null
    logger.info('[BG] Restored active session', activeSessionId)
  }
}

export async function startSession(
  tabId: number,
  metadata: SessionMeta,
  config: CaptureConfig,
): Promise<void> {
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
  const session: Session = {
    sessionId,
    name: `${SESSION_NAME_PREFIX} ${new Date(now).toLocaleString()}`,
    state: 'recording',
    startUrl: tab?.url ?? '',
    startedAt: now,
    tabId,
    metadata,
    config,
  }

  await createSession(session)
  activeSessionId = sessionId
  activeTabId = tabId

  await sendToTab(tabId, { type: 'START_CAPTURE', sessionId, config }).catch((err) =>
    logger.error('[BG] Failed to send START_CAPTURE', err),
  )

  await broadcastToUI({ type: 'SESSION_STATE_CHANGED', session })

  await chrome.action.setBadgeText({ text: 'REC' }).catch(() => undefined)
  await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' }).catch(() => undefined)

  logger.info('[BG] Session started', sessionId)
}

export async function stopSession(sessionId: string): Promise<void> {
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

  activeSessionId = null
  activeTabId = null

  await chrome.action.setBadgeText({ text: '' }).catch(() => undefined)

  logger.info('[BG] Session stopped', sessionId)
}

export function getActiveSessionId(): string | null {
  return activeSessionId
}
