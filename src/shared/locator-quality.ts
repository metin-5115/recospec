import { LOCATOR_WEAK_SCORE_THRESHOLD } from './constants'
import type { LocatorBundle } from './types/locator'
import type { ActionType, RecordedAction } from './types/action'

/**
 * Quality of the locator captured for a step.
 * - `ok`     — a unique, high-scoring locator was found.
 * - `weak`   — a locator exists but scores below the acceptable threshold.
 * - `shadow` — the element lives inside a (possibly closed) shadow root.
 * - `frame`  — the element lives inside an iframe.
 * - `none`   — no usable locator could be computed for the element.
 */
export type LocatorQualityLevel = 'ok' | 'weak' | 'shadow' | 'frame' | 'none'

export interface LocatorQuality {
  level: LocatorQualityLevel
  /** Primary locator stability score (0–100) when one exists. */
  score?: number
  /** Actionable, human-readable explanation. `null` only for `ok`. */
  hint: string | null
}

const OK: LocatorQuality = { level: 'ok', hint: null }

/**
 * Action types that never carry an element locator and therefore can never
 * have a locator-quality problem (network requests, explicit waits, plain
 * navigations). Excluded from classification entirely.
 */
const NON_LOCATOR_TYPES: ReadonlySet<ActionType> = new Set<ActionType>([
  'network',
  'wait',
  'navigate',
])

interface QualityInput {
  hasPrimary: boolean
  score?: number
  shadowContext?: unknown
  shadowClosed?: boolean
  frameContext?: unknown
}

/**
 * Core rules, first match wins. A structural reason (frame / shadow) beats a
 * bare low score because it tells the user *why* the locator is fragile and
 * what to do about it.
 */
function classify(input: QualityInput): LocatorQuality {
  if (!input.hasPrimary) {
    return {
      level: 'none',
      hint: 'No stable locator found — add a data-testid to this element.',
    }
  }
  if (input.frameContext) {
    return {
      level: 'frame',
      score: input.score,
      hint: 'Inside an iframe — the locator may break if the frame changes.',
    }
  }
  if (input.shadowClosed) {
    return {
      level: 'shadow',
      score: input.score,
      hint: 'Inside a closed shadow DOM — the locator is likely unreliable.',
    }
  }
  if (input.shadowContext) {
    return {
      level: 'shadow',
      score: input.score,
      hint: 'Inside shadow DOM — the locator may be fragile.',
    }
  }
  if (typeof input.score === 'number' && input.score < LOCATOR_WEAK_SCORE_THRESHOLD) {
    return {
      level: 'weak',
      score: input.score,
      hint: `Weak locator (score ${Math.round(input.score)}) — consider adding a data-testid.`,
    }
  }
  return { level: 'ok', score: input.score, hint: null }
}

/**
 * Classify a freshly computed locator bundle at capture time. Called from the
 * background event aggregator so the quality signal is persisted with the step.
 */
export function classifyBundle(bundle: LocatorBundle | null): LocatorQuality {
  if (!bundle || !bundle.primary) {
    return classify({ hasPrimary: false })
  }
  return classify({
    hasPrimary: true,
    score: bundle.primary.score,
    shadowContext: bundle.shadowContext,
    shadowClosed: bundle.shadowClosed,
    frameContext: bundle.frameContext,
  })
}

/**
 * Classify a stored step. Used by the UI to render quality markers and as a
 * fallback for steps recorded before the quality signal was persisted, and to
 * re-derive quality after a user manually overrides the locator.
 */
export function classifyStep(step: RecordedAction): LocatorQuality {
  if (NON_LOCATOR_TYPES.has(step.type)) return OK
  // Page-level assertions (e.g. full-page screenshot) carry no element target.
  if (step.type === 'assert' && !step.target) return OK

  const target = step.target
  if (!target || !target.primaryLocator) {
    // The step targeted an element (snapshot present) but no locator was
    // produced. With no element at all there is nothing to flag.
    return step.elementSnapshot ? classify({ hasPrimary: false }) : OK
  }
  return classify({
    hasPrimary: true,
    score: target.primaryLocator.score,
    shadowContext: target.shadowContext,
    shadowClosed: target.shadowClosed,
    frameContext: target.frameContext,
  })
}

/**
 * Maps a stability score (0–100) to a human-readable tier and the Tailwind
 * colours used to highlight the score in the UI. The Medium/Weak boundary
 * matches `LOCATOR_WEAK_SCORE_THRESHOLD` so the badge and the quality warning
 * always agree.
 *
 * Lives here (pure, shared) so both the locator engine context and the side
 * panel can use it without the side panel owning the tier logic.
 */
export function scoreTier(score: number): {
  label: 'Strong' | 'Medium' | 'Weak'
  textClass: string
  bgClass: string
} {
  if (score >= 80) return { label: 'Strong', textClass: 'text-success', bgClass: 'bg-success' }
  if (score >= LOCATOR_WEAK_SCORE_THRESHOLD)
    return { label: 'Medium', textClass: 'text-warning', bgClass: 'bg-warning' }
  return { label: 'Weak', textClass: 'text-danger', bgClass: 'bg-danger' }
}
