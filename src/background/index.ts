import { logger } from '@shared/logger'
import { restoreActiveSession } from './session-manager'
import { initMessageRouter } from './message-router'

logger.info('[BG] Service worker started')

initMessageRouter()

restoreActiveSession().catch((err) => logger.error('[BG] Failed to restore session', err))

// Cleanup in-memory state when the service worker is about to be suspended.
// Persistent state lives in IndexedDB and survives across suspension cycles.
chrome.runtime.onSuspend.addListener(() => {
  logger.info('[BG] Service worker suspending')
})
