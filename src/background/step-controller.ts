import {
  reorderActions,
  updateAction,
  getAction,
  getActionsBySession,
  deleteAction,
} from '@storage/action-repo'
import { getSession } from '@storage/session-repo'
import { broadcastToUI } from '@shared/messaging/send'
import { logger } from '@shared/logger'
import type { StepPatch } from '@shared/types/messages'

/**
 * Apply a user-driven reorder to a session's steps. Refuses while the session is
 * actively recording — only paused / stopped sessions accept manual edits.
 */
export async function handleStepsReordered(
  sessionId: string,
  orderedActionIds: string[],
): Promise<void> {
  const session = await getSession(sessionId)
  if (!session) {
    logger.warn('[BG] STEPS_REORDERED for unknown session', sessionId)
    return
  }
  if (session.state === 'recording') {
    logger.warn('[BG] STEPS_REORDERED rejected: session still recording', sessionId)
    return
  }
  const steps = await reorderActions(sessionId, orderedActionIds)
  await broadcastToUI({ type: 'STEPS_SYNCED', sessionId, steps })
  logger.info('[BG] Steps reordered', sessionId, orderedActionIds.length)
}

/**
 * Apply a partial update to a single step. The patch may include a fully-prepared
 * `target` object (e.g. with a new primaryLocator + userOverridden=true).
 */
export async function handleStepUpdated(
  sessionId: string,
  actionId: string,
  patch: StepPatch,
): Promise<void> {
  const session = await getSession(sessionId)
  if (!session) {
    logger.warn('[BG] STEP_UPDATED for unknown session', sessionId)
    return
  }
  if (session.state === 'recording') {
    logger.warn('[BG] STEP_UPDATED rejected: session still recording', sessionId)
    return
  }
  const existing = await getAction(actionId)
  if (!existing || existing.sessionId !== sessionId) {
    logger.warn('[BG] STEP_UPDATED for unknown actionId', actionId)
    return
  }
  await updateAction(actionId, patch)
  const steps = await getActionsBySession(sessionId)
  await broadcastToUI({ type: 'STEPS_SYNCED', sessionId, steps })
  logger.info('[BG] Step updated', sessionId, actionId)
}

/** Persist a user-driven step deletion and renumber survivors. */
export async function handleStepDeleted(sessionId: string, actionId: string): Promise<void> {
  const session = await getSession(sessionId)
  if (!session) {
    logger.warn('[BG] STEP_DELETED for unknown session', sessionId)
    return
  }
  if (session.state === 'recording') {
    logger.warn('[BG] STEP_DELETED rejected: session still recording', sessionId)
    return
  }
  const existing = await getAction(actionId)
  if (!existing || existing.sessionId !== sessionId) {
    logger.warn('[BG] STEP_DELETED for unknown actionId', actionId)
    return
  }
  const steps = await deleteAction(sessionId, actionId)
  await broadcastToUI({ type: 'STEPS_SYNCED', sessionId, steps })
  logger.info('[BG] Step deleted', sessionId, actionId)
}
