import type { AssertionSuggestion, ElementSnapshot } from '@shared/types/action'
import type { LocatorBundle } from '@shared/types/locator'
import { getActiveTabId } from './session-manager'
import { sendToTab, broadcastToUI } from '@shared/messaging/send'
import { appendAction } from '@storage/action-repo'
import { getActionsBySession } from '@storage/action-repo'
import { logger } from '@shared/logger'

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
  sessionId: string,
  locatorBundle: LocatorBundle | null,
  elementSnapshot: ElementSnapshot,
  suggestions: AssertionSuggestion[],
  pageMetadata: { url: string; title: string },
): Promise<void> {
  await broadcastToUI({
    type: 'ASSERTION_SUGGESTIONS',
    locatorBundle,
    elementSnapshot,
    suggestions,
    pageMetadata,
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
): Promise<void> {
  const existing = await getActionsBySession(sessionId)
  const sequenceNumber = existing.length

  const expected =
    customExpected !== undefined && customExpected !== '' ? customExpected : suggestion.expected

  const action = {
    actionId: crypto.randomUUID(),
    sessionId,
    sequenceNumber,
    type: 'assert' as const,
    timestamp: Date.now(),
    pageUrl: pageMetadata.url,
    pageTitle: pageMetadata.title || undefined,
    target: locatorBundle
      ? {
          primaryLocator: locatorBundle.primary,
          fallbackLocators: locatorBundle.fallbacks,
          elementSnapshot,
        }
      : undefined,
    elementSnapshot,
    payload: {
      assertionType: suggestion.type,
      expected,
      attribute: suggestion.attribute,
    },
    annotation: suggestion.label,
  }

  await appendAction(action)
  await broadcastToUI({ type: 'STEP_RECORDED', sessionId, step: action })
  logger.debug('[BG] Assertion step recorded', action.actionId, suggestion.type)
}
