import type { LocatorValidationResult, LocatorValidationTarget } from '@shared/types/messages'
import type { FrameContext, Locator, ShadowContext } from '@shared/types/locator'
import { broadcastToUI, sendToTab } from '@shared/messaging/send'
import {
  LOCATOR_VALIDATION_HIGHLIGHT_DURATION_MS,
  LOCATOR_VALIDATION_MAX_TARGETS,
} from '@shared/constants'
import { logger } from '@shared/logger'

interface PendingValidation {
  sessionId: string
  startedAt: number
  truncated?: number
  recordedUrl?: string
  timeout: number
}

const pending = new Map<string, PendingValidation>()
const VALIDATION_TIMEOUT_MS = 8_000

async function resolveActiveTab(): Promise<chrome.tabs.Tab | null> {
  try {
    const win = await chrome.windows.getLastFocused({
      populate: true,
      windowTypes: ['normal'],
    })
    const active = win.tabs?.find((t) => t.active)
    if (active?.id !== undefined) return active
  } catch {
    /* fall through */
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    return tab ?? null
  } catch {
    return null
  }
}

function annotateUrlMismatch(
  results: LocatorValidationResult[],
  pageUrl: string,
  recordedUrl: string | undefined,
): LocatorValidationResult[] {
  if (!recordedUrl) return results
  let recordedOrigin: string
  let pageOrigin: string
  try {
    recordedOrigin = new URL(recordedUrl).origin
    pageOrigin = new URL(pageUrl).origin
  } catch {
    return results
  }
  if (recordedOrigin === pageOrigin) return results
  return results.map((r) => ({ ...r, urlMismatch: true }))
}

export async function handleValidateLocators(
  sessionId: string,
  targets: LocatorValidationTarget[],
  recordedUrl?: string,
): Promise<void> {
  const tab = await resolveActiveTab()
  if (!tab?.id) {
    await broadcastToUI({
      type: 'LOCATOR_VALIDATION_RESULT',
      sessionId,
      results: [],
      durationMs: 0,
      pageUrl: '',
      error: 'No active browser tab. Click into the page you want to validate, then try again.',
    })
    return
  }

  const truncated = targets.length > LOCATOR_VALIDATION_MAX_TARGETS ? targets.length : undefined
  const trimmed = targets.slice(0, LOCATOR_VALIDATION_MAX_TARGETS)

  // Cancel any in-flight timeout for this session.
  const existing = pending.get(sessionId)
  if (existing) {
    clearTimeout(existing.timeout)
    pending.delete(sessionId)
  }

  const timeout = setTimeout(() => {
    const stale = pending.get(sessionId)
    if (!stale) return
    pending.delete(sessionId)
    void broadcastToUI({
      type: 'LOCATOR_VALIDATION_RESULT',
      sessionId,
      results: [],
      durationMs: VALIDATION_TIMEOUT_MS,
      pageUrl: tab.url ?? '',
      error: 'Validation timed out — the page may have navigated or stopped responding.',
    })
  }, VALIDATION_TIMEOUT_MS) as unknown as number

  pending.set(sessionId, {
    sessionId,
    startedAt: Date.now(),
    truncated,
    recordedUrl,
    timeout,
  })

  try {
    await sendToTab(tab.id, {
      type: 'VALIDATE_LOCATORS_RUN',
      sessionId,
      targets: trimmed,
    })
  } catch (err) {
    clearTimeout(timeout)
    pending.delete(sessionId)
    logger.error('[BG] VALIDATE_LOCATORS sendToTab failed', err)
    await broadcastToUI({
      type: 'LOCATOR_VALIDATION_RESULT',
      sessionId,
      results: [],
      durationMs: 0,
      pageUrl: tab.url ?? '',
      error:
        'Could not reach the page. Reload the tab so Recospec can re-inject its content script.',
    })
  }
}

export async function handleValidationResponse(
  sessionId: string,
  results: LocatorValidationResult[],
  durationMs: number,
  pageUrl: string,
): Promise<void> {
  const entry = pending.get(sessionId)
  if (entry) {
    clearTimeout(entry.timeout)
    pending.delete(sessionId)
  }
  const annotated = annotateUrlMismatch(results, pageUrl, entry?.recordedUrl)
  await broadcastToUI({
    type: 'LOCATOR_VALIDATION_RESULT',
    sessionId,
    results: annotated,
    durationMs,
    pageUrl,
    truncated: entry?.truncated,
  })
}

export async function handleHighlightLocator(
  _sessionId: string,
  locator: Locator,
  shadowContext: ShadowContext | undefined,
  frameContext: FrameContext | undefined,
  label: string | undefined,
): Promise<void> {
  const tab = await resolveActiveTab()
  if (!tab?.id) return
  await sendToTab(tab.id, {
    type: 'HIGHLIGHT_LOCATOR_ON_PAGE',
    locator,
    shadowContext,
    frameContext,
    label,
    durationMs: LOCATOR_VALIDATION_HIGHLIGHT_DURATION_MS,
  }).catch((err) => logger.error('[BG] HIGHLIGHT_LOCATOR sendToTab failed', err))
}
