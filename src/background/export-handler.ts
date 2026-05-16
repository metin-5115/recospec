import { getSessionWithActions, listSessions } from '@storage/session-repo'
import { buildJsonExport, type JsonExportPayload } from '@codegen/export/json-export'

/**
 * Resolve a single session into a `JsonExportPayload`. When no `sessionId`
 * is supplied, returns the most-recently-stopped session (or the latest
 * session overall when none have been stopped yet).
 *
 * Returns `null` when no recording exists or the selected session has no
 * captured actions — the VS Code Record flow uses that to surface a
 * friendly "No steps recorded" message instead of writing an empty file.
 */
export async function handleExportRequest(sessionId?: string): Promise<JsonExportPayload | null> {
  let targetId = sessionId
  if (!targetId) {
    const sessions = await listSessions() // newest first
    const stopped = sessions.find((s) => s.state === 'stopped')
    targetId = (stopped ?? sessions[0])?.sessionId
  }
  if (!targetId) return null

  const bundle = await getSessionWithActions(targetId)
  if (!bundle || bundle.actions.length === 0) return null

  return buildJsonExport(bundle.session, bundle.actions)
}
