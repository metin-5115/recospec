import type { AssertionSuggestion, ElementSnapshot, RecordedAction } from '@shared/types/action'
import type { LocatorBundle } from '@shared/types/locator'
import { getActiveTabId } from './session-manager'
import { sendToTab, broadcastToUI } from '@shared/messaging/send'
import { appendAction, getActionsBySession } from '@storage/action-repo'
import { db } from '@storage/db'
import { logger } from '@shared/logger'

async function captureVisibleTabSafe(): Promise<string | undefined> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' })
    return dataUrl ?? undefined
  } catch (err) {
    logger.warn('[BG] captureVisibleTab failed', err)
    return undefined
  }
}

export async function handleAssertionProbeStart(sessionId: string): Promise<void> {
  const tabId = getActiveTabId()
  if (tabId === null) {
    logger.warn('[BG] No active tab for assertion probe start')
    return
  }
  await sendToTab(tabId, { type: 'START_ASSERTION_PROBE', sessionId })
}

export async function handleAssertionProbeStop(sessionId: string): Promise<void> {
  const tabId = getActiveTabId()
  if (tabId === null) return
  await sendToTab(tabId, { type: 'STOP_ASSERTION_PROBE', sessionId })
}

export async function handleAssertionSuggestion(
  _sessionId: string,
  locatorBundle: LocatorBundle | null,
  elementSnapshot: ElementSnapshot,
  suggestions: AssertionSuggestion[],
  pageMetadata: { url: string; title: string },
): Promise<void> {
  const hasScreenshot = suggestions.some((s) => s.type === 'screenshot')
  const screenshotDataUrl = hasScreenshot ? await captureVisibleTabSafe() : undefined
  await broadcastToUI({
    type: 'ASSERTION_SUGGESTIONS',
    locatorBundle,
    elementSnapshot,
    suggestions,
    pageMetadata,
    screenshotDataUrl,
  })
  logger.debug('[BG] Assertion suggestions forwarded to UI', suggestions.length)
}

export async function handleAssertionAdd(
  sessionId: string,
  suggestion: AssertionSuggestion,
  customExpected: string | undefined,
  locatorBundle: LocatorBundle | null,
  elementSnapshot: ElementSnapshot,
  pageMetadata: { url: string; title: string },
  afterActionId?: string,
): Promise<void> {
  const existing = await getActionsBySession(sessionId)
  const insertIndex = resolveInsertIndex(existing, afterActionId)

  const isScreenshot = suggestion.type === 'screenshot'
  const expected =
    customExpected !== undefined && customExpected !== '' ? customExpected : suggestion.expected

  const payload: Record<string, unknown> = {
    assertionType: suggestion.type,
  }
  if (isScreenshot) {
    payload.name =
      customExpected !== undefined && customExpected !== ''
        ? customExpected
        : (suggestion.name ?? 'snapshot')
    payload.threshold = suggestion.threshold ?? 0.2
  } else {
    payload.expected = expected
    payload.attribute = suggestion.attribute
  }

  const action: RecordedAction = {
    actionId: crypto.randomUUID(),
    sessionId,
    sequenceNumber: insertIndex,
    type: 'assert' as const,
    timestamp: Date.now(),
    pageUrl: pageMetadata.url,
    pageTitle: pageMetadata.title || undefined,
    target:
      !isScreenshot && locatorBundle
        ? {
            primaryLocator: locatorBundle.primary,
            fallbackLocators: locatorBundle.fallbacks,
            elementSnapshot,
          }
        : undefined,
    elementSnapshot,
    payload,
    annotation: suggestion.label,
  }

  if (afterActionId !== undefined && insertIndex < existing.length) {
    // Inserting between steps — shift every subsequent sequenceNumber up by
    // one so the new row lands in place. Done in a single Dexie transaction
    // so a partial failure cannot leave gaps in the sequence.
    await db.transaction('rw', db.actions, async () => {
      for (let i = existing.length - 1; i >= insertIndex; i--) {
        await db.actions.update(existing[i].actionId, { sequenceNumber: i + 1 })
      }
      await db.actions.add(action)
    })
    // Broadcast the new ordered list so the side panel re-renders without
    // having to fetch from Dexie itself.
    const synced = await getActionsBySession(sessionId)
    await broadcastToUI({ type: 'STEPS_SYNCED', sessionId, steps: synced })
  } else {
    await appendAction(action)
    await broadcastToUI({ type: 'STEP_RECORDED', sessionId, step: action })
  }

  logger.debug(
    '[BG] Assertion step recorded',
    action.actionId,
    suggestion.type,
    afterActionId ? `after ${afterActionId}` : '(append)',
  )
}

function resolveInsertIndex(existing: RecordedAction[], afterActionId?: string): number {
  if (!afterActionId) return existing.length
  const idx = existing.findIndex((a) => a.actionId === afterActionId)
  if (idx < 0) return existing.length
  return idx + 1
}
