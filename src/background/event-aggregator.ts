import type { CapturedEvent } from '@shared/types/action'
import type { RecordedAction } from '@shared/types/action'
import {
  appendNextAction,
  appendNextActions,
  getActionsBySession,
  setActionFingerprint,
} from '@storage/action-repo'
import type { ElementFingerprint } from '@shared/types/locator'
import {
  computeFlowSignature,
  findIterationCandidate,
  getSession,
  updateSession,
} from '@storage/session-repo'
import { broadcastToUI } from '@shared/messaging/send'
import { ITERATION_SIGNATURE_STEPS, NETWORK_BATCH_WINDOW_MS } from '@shared/constants'
import { classifyBundle } from '@shared/locator-quality'
import { logger } from '@shared/logger'

/**
 * Probe the DB for a prior session that shares this flow's shape so the UI
 * can offer the user a "Continue as v<n+1>" link. Updates the live session's
 * placeholder signature with the real one in the same write.
 */
async function maybeSuggestIteration(sessionId: string): Promise<void> {
  const session = await getSession(sessionId)
  if (!session) return
  // Don't re-prompt once a session has already been linked to a parent.
  if (session.parentSessionId) return

  const steps = await getActionsBySession(sessionId)

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

type ActionDraft = Omit<RecordedAction, 'sequenceNumber'>

/** Network calls waiting for their window to close. Loss on a worker restart costs at most one window. */
const pendingNetwork: ActionDraft[] = []
let openWindow: Promise<void> | null = null
let writes: Promise<void> = Promise.resolve()

function waitForWindow(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, NETWORK_BATCH_WINDOW_MS))
}

/** The step as the side panel receives it: the response body (up to 50 KB) stays in IndexedDB. */
function withoutResponseBody(action: RecordedAction): RecordedAction {
  if (!action.payload || !('responseBody' in action.payload)) return action
  const payload = { ...action.payload }
  delete payload.responseBody
  return { ...action, payload }
}

async function writePendingNetwork(): Promise<void> {
  const drafts = pendingNetwork.splice(0)
  if (drafts.length === 0) return
  const actions = await appendNextActions(drafts)

  const bySession = new Map<string, RecordedAction[]>()
  for (const action of actions) {
    bySession.set(action.sessionId, [...(bySession.get(action.sessionId) ?? []), action])
  }
  for (const [sessionId, steps] of bySession) {
    await broadcastToUI({
      type: 'NETWORK_STEPS_RECORDED',
      sessionId,
      steps: steps.map(withoutResponseBody),
    })
  }
  for (const action of actions) {
    if (action.sequenceNumber === ITERATION_SIGNATURE_STEPS - 1) {
      await maybeSuggestIteration(action.sessionId).catch((err) =>
        logger.error('[BG] maybeSuggestIteration failed', err),
      )
    }
  }
}

/**
 * Writes every pending network call now, in one transaction. Writes are queued one after the
 * other, so a batch is always stored before anything recorded after it.
 */
export function flushNetworkBatch(): Promise<void> {
  const run = writes.then(writePendingNetwork)
  writes = run.catch(() => undefined)
  return run
}

/** Queues a network call; resolves once the batch it joined is stored. */
function enqueueNetwork(draft: ActionDraft): Promise<void> {
  pendingNetwork.push(draft)
  if (!openWindow) {
    openWindow = waitForWindow().then(() => {
      openWindow = null
      return flushNetworkBatch()
    })
  }
  return openWindow
}

/** Actions being written right now, so a fingerprint that overtakes its action can wait for it. */
const storingActions = new Map<string, Promise<RecordedAction>>()

/** Attaches a fingerprint computed after the click to the action it belongs to. */
export async function attachFingerprint(
  sessionId: string,
  actionId: string,
  fingerprint: ElementFingerprint,
): Promise<void> {
  await storingActions.get(actionId)?.catch(() => undefined)
  if (!(await setActionFingerprint(actionId, fingerprint))) return
  await broadcastToUI({ type: 'STEP_FINGERPRINT', sessionId, actionId, fingerprint })
}

export async function aggregateEvent(sessionId: string, event: CapturedEvent): Promise<void> {
  const bundle = event.target?.locatorBundle ?? null
  const quality = classifyBundle(bundle)
  const flag = quality.level !== 'ok' ? quality : undefined
  // sequenceNumber is assigned inside the append transaction (see appendNextAction).
  const draft: Omit<RecordedAction, 'sequenceNumber'> = {
    actionId: event.eventId ?? crypto.randomUUID(),
    sessionId,
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

  // A page makes many requests per interaction: write them as a batch, but never let one
  // overtake the step recorded after it.
  if (event.type === 'network') return enqueueNetwork(draft)
  // Registered before the flush, so a fingerprint that arrives meanwhile finds it.
  const storing = flushNetworkBatch().then(() => appendNextAction(draft))
  storingActions.set(draft.actionId, storing)
  const action = await storing.finally(() => storingActions.delete(draft.actionId))
  const { sequenceNumber } = action
  await broadcastToUI({ type: 'STEP_RECORDED', sessionId, step: action })
  logger.debug('[BG] Step recorded', action.actionId, action.type)

  // Trigger the iteration suggestion once we've collected enough shape to
  // discriminate flows. `sequenceNumber === N - 1` is the step index of the
  // Nth captured step (zero-based).
  if (sequenceNumber === ITERATION_SIGNATURE_STEPS - 1) {
    await maybeSuggestIteration(sessionId).catch((err) =>
      logger.error('[BG] maybeSuggestIteration failed', err),
    )
  }
}
