import type { CapturedEvent } from '@shared/types/action'
import type { RecordedAction } from '@shared/types/action'
import { appendAction, getActionsBySession } from '@storage/action-repo'
import {
  computeFlowSignature,
  findIterationCandidate,
  getSession,
  updateSession,
} from '@storage/session-repo'
import { broadcastToUI } from '@shared/messaging/send'
import { ITERATION_SIGNATURE_STEPS } from '@shared/constants'
import { classifyBundle } from '@shared/locator-quality'
import { logger } from '@shared/logger'

/**
 * Probe the DB for a prior session that shares this flow's shape so the UI
 * can offer the user a "Continue as v<n+1>" link. Updates the live session's
 * placeholder signature with the real one in the same write.
 */
async function maybeSuggestIteration(sessionId: string, steps: RecordedAction[]): Promise<void> {
  const session = await getSession(sessionId)
  if (!session) return
  // Don't re-prompt once a session has already been linked to a parent.
  if (session.parentSessionId) return

  const signature = computeFlowSignature(session.startUrl, steps)
  if (signature !== session.flowSignature) {
    await updateSession(sessionId, { flowSignature: signature })
  }
  const candidate = await findIterationCandidate(signature, sessionId)
  if (!candidate) return

  await broadcastToUI({
    type: 'SESSION_ITERATION_SUGGESTED',
    sessionId,
    parentSessionId: candidate.sessionId,
    parentName: candidate.name,
    parentIterationNumber: candidate.iterationNumber,
    parentTimestamp: candidate.stoppedAt ?? candidate.startedAt,
  })
  logger.info('[BG] Iteration suggested for session', sessionId, '→ parent', candidate.sessionId)
}

export async function aggregateEvent(sessionId: string, event: CapturedEvent): Promise<void> {
  const existing = await getActionsBySession(sessionId)
  const sequenceNumber = existing.length

  const bundle = event.target?.locatorBundle ?? null
  const quality = classifyBundle(bundle)
  const flag = quality.level !== 'ok' ? quality : undefined
  const action: RecordedAction = {
    actionId: crypto.randomUUID(),
    sessionId,
    sequenceNumber,
    type: event.type,
    timestamp: event.timestamp,
    pageUrl: event.pageMetadata.url,
    pageTitle: event.pageMetadata.title || undefined,
    target: bundle
      ? {
          primaryLocator: bundle.primary,
          fallbackLocators: bundle.fallbacks,
          allCandidates: bundle.allCandidates,
          elementSnapshot: event.target!.elementSnapshot,
          shadowContext: bundle.shadowContext,
          shadowClosed: bundle.shadowClosed,
          frameContext: bundle.frameContext,
          quality: flag,
          diagnostics: bundle.diagnostics?.length ? bundle.diagnostics : undefined,
          fingerprint: bundle.fingerprint,
        }
      : undefined,
    elementSnapshot: event.target?.elementSnapshot,
    // When no bundle was produced for a targeted element, the `none` signal
    // lives at the top level since `target` is undefined.
    quality: !bundle && event.target ? flag : undefined,
    payload: event.payload,
  }

  await appendAction(action)
  await broadcastToUI({ type: 'STEP_RECORDED', sessionId, step: action })
  logger.debug('[BG] Step recorded', action.actionId, action.type)

  // Trigger the iteration suggestion once we've collected enough shape to
  // discriminate flows. `sequenceNumber === N - 1` is the step index of the
  // Nth captured step (zero-based).
  if (sequenceNumber === ITERATION_SIGNATURE_STEPS - 1) {
    await maybeSuggestIteration(sessionId, [...existing, action]).catch((err) =>
      logger.error('[BG] maybeSuggestIteration failed', err),
    )
  }
}
