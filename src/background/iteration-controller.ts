import { linkIteration } from '@storage/session-repo'
import { broadcastToUI } from '@shared/messaging/send'
import { logger } from '@shared/logger'

/**
 * Attach the live session to a parent picked from the
 * `SESSION_ITERATION_SUGGESTED` prompt. Broadcasts a fresh
 * `SESSION_STATE_CHANGED` so the side panel re-renders the row with its new
 * name + iteration number.
 */
export async function handleIterationAccept(
  sessionId: string,
  parentSessionId: string,
): Promise<void> {
  const linked = await linkIteration(sessionId, parentSessionId)
  if (!linked) {
    logger.warn('[BG] handleIterationAccept: parent or session missing', sessionId, parentSessionId)
    return
  }
  await broadcastToUI({ type: 'SESSION_STATE_CHANGED', session: linked })
  logger.info('[BG] Session linked as iteration', sessionId, '→ parent', parentSessionId)
}

/**
 * No-op on the backend — the UI just dismisses its banner. Kept as an
 * explicit handler so we have a hook for future analytics / "don't ask
 * again" preferences.
 */
export async function handleIterationDismiss(sessionId: string): Promise<void> {
  logger.debug('[BG] Iteration suggestion dismissed for', sessionId)
}
