import { logger } from '@shared/logger'
import { restoreActiveSession } from './session-manager'
import { initMessageRouter } from './message-router'
import { handleExportRequest } from './export-handler'
import { startReplay } from './replay-controller'
import { db } from '@storage/db'
import type { RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'

logger.info('[BG] Service worker started')

initMessageRouter()

// Expose the export handler on the service-worker global so the VS Code
// extension can pull a JSON payload via Playwright `worker.evaluate(...)`
// after the user clicks Stop in the side panel. The internal `chrome.runtime`
// message bus cannot deliver messages to the sender itself, and the VS Code
// host has no other route into the extension — CDP eval is the bridge.
;(globalThis as unknown as { __recospecExport: typeof handleExportRequest }).__recospecExport =
  handleExportRequest

// `__recospecReplay` is the same CDP-eval bridge for the replay controller
// — covers both the E2E suite and ad-hoc "replay this session" scripting.
;(globalThis as unknown as { __recospecReplay: typeof startReplay }).__recospecReplay = startReplay

// Test-only Dexie seeder so the replay E2E suite can load a session without
// driving the side panel UI. Writes one session + N actions in a single
// shot; broadcasting is intentionally skipped (the side panel isn't open
// during E2E, and Dexie is the source of truth the replay controller reads
// from anyway).
async function seedSession(session: Session, actions: RecordedAction[]): Promise<void> {
  await db.sessions.put(session)
  await db.actions.bulkPut(actions)
}
;(globalThis as unknown as { __recospecSeed: typeof seedSession }).__recospecSeed = seedSession

restoreActiveSession().catch((err) => logger.error('[BG] Failed to restore session', err))

// Cleanup in-memory state when the service worker is about to be suspended.
// Persistent state lives in IndexedDB and survives across suspension cycles.
chrome.runtime.onSuspend.addListener(() => {
  logger.info('[BG] Service worker suspending')
})
