import { logger } from '@shared/logger'
import { restoreActiveSession } from './session-manager'
import { initMessageRouter } from './message-router'
import { handleExportRequest } from './export-handler'

logger.info('[BG] Service worker started')

initMessageRouter()

// Expose the export handler on the service-worker global so the VS Code
// extension can pull a JSON payload via Playwright `worker.evaluate(...)`
// after the user clicks Stop in the side panel. The internal `chrome.runtime`
// message bus cannot deliver messages to the sender itself, and the VS Code
// host has no other route into the extension — CDP eval is the bridge.
;(globalThis as unknown as { __playforgeExport: typeof handleExportRequest }).__playforgeExport =
  handleExportRequest

restoreActiveSession().catch((err) => logger.error('[BG] Failed to restore session', err))

// Cleanup in-memory state when the service worker is about to be suspended.
// Persistent state lives in IndexedDB and survives across suspension cycles.
chrome.runtime.onSuspend.addListener(() => {
  logger.info('[BG] Service worker suspending')
})
