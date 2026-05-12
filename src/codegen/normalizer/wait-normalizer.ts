import type { RecordedAction } from '@shared/types/action'
import type { Locator, ShadowContext, FrameContext } from '@shared/types/locator'
import type { IRStep, IRElement, IRWaitInfo, IRWaitReason } from '../ir/types'
import { AUTO_WAIT_DEFAULT_TIMEOUT_MS } from '@shared/constants'

/**
 * Pure converter from a `wait`-typed recorded action to an `IRStep`.
 * Returns `null` when the action is malformed (no reason on the payload),
 * letting the caller skip it without throwing.
 */

const VALID_REASONS: ReadonlySet<IRWaitReason> = new Set([
  'networkidle',
  'spinner',
  'element-hidden',
  'element-visible',
])

interface BuildElementFn {
  (
    snapshot: import('@shared/types/action').ElementSnapshot,
    primary: Locator,
    fallbacks: Locator[] | undefined,
    shadowContext?: ShadowContext,
    shadowClosed?: boolean,
    frameContext?: FrameContext,
  ): IRElement
}

function readWait(action: RecordedAction): IRWaitInfo | null {
  const raw = action.payload?.wait
  if (!raw || typeof raw !== 'object') return null
  const r = (raw as { reason?: unknown }).reason
  if (typeof r !== 'string' || !VALID_REASONS.has(r as IRWaitReason)) return null
  const t = (raw as { timeoutMs?: unknown }).timeoutMs
  const timeoutMs =
    typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : AUTO_WAIT_DEFAULT_TIMEOUT_MS
  return { reason: r as IRWaitReason, timeoutMs }
}

export function normalizeWaitAction(
  action: RecordedAction,
  buildElement: BuildElementFn,
): IRStep | null {
  if (action.type !== 'wait') return null
  const wait = readWait(action)
  if (!wait) return null

  const element =
    action.target &&
    (wait.reason === 'spinner' ||
      wait.reason === 'element-hidden' ||
      wait.reason === 'element-visible')
      ? buildElement(
          action.target.elementSnapshot,
          action.target.primaryLocator,
          action.target.fallbackLocators,
          action.target.shadowContext,
          action.target.shadowClosed,
          action.target.frameContext,
        )
      : undefined

  return {
    id: action.actionId,
    action: 'wait',
    element,
    wait,
    annotation: action.annotation,
  }
}
