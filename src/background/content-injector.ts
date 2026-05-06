import { logger } from '@shared/logger'
import { CONTENT_REINJECT_MAX_ATTEMPTS } from '@shared/constants'

const reinjectAttempts = new Map<number, number>()

export async function reinjectContentScript(tabId: number): Promise<void> {
  const attempts = reinjectAttempts.get(tabId) ?? 0
  if (attempts >= CONTENT_REINJECT_MAX_ATTEMPTS) {
    logger.error('[BG] Max re-inject attempts reached for tab', tabId)
    reinjectAttempts.delete(tabId)
    return
  }

  reinjectAttempts.set(tabId, attempts + 1)
  logger.warn('[BG] Re-injecting content script, attempt', attempts + 1, 'tab', tabId)

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    })
    reinjectAttempts.delete(tabId)
    logger.info('[BG] Content script re-injected successfully', tabId)
  } catch (err) {
    logger.error('[BG] Content script re-inject failed', err)
  }
}

export function resetReinjectAttempts(tabId: number): void {
  reinjectAttempts.delete(tabId)
}
