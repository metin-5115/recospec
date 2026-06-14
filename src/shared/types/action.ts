import type {
  Locator,
  LocatorBundle,
  ScoredLocator,
  ShadowContext,
  FrameContext,
  RejectedCandidate,
  ElementFingerprint,
} from './locator'
import type { LocatorQuality } from '../locator-quality'

export type ActionType =
  | 'click'
  | 'dblclick'
  | 'fill'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'navigate'
  | 'hover'
  | 'scroll'
  | 'keypress'
  | 'assert'
  | 'wait'
  | 'screenshot'
  | 'manual-coordinate'
  | 'network'

/** Payload shape for `type: 'network'` recorded actions. */
export interface NetworkPayload {
  method: string
  url: string
  status?: number
  contentType?: string
  /** Response body (truncated to NETWORK_BODY_MAX_BYTES). */
  responseBody?: string
  /** Request body when present and serialisable. */
  requestBody?: string
  durationMs?: number
}

export type AssertionType =
  | 'visible'
  | 'hidden'
  | 'text'
  | 'text-contains'
  /** Element text is non-empty (robust for dynamic values — "a price is shown"). */
  | 'not-empty'
  /** Element text matches a regex pattern (the `expected` field holds the source). */
  | 'matches'
  | 'value'
  | 'attribute'
  | 'count'
  | 'screenshot'

export interface AssertionSuggestion {
  type: AssertionType
  label: string
  expected?: string | number
  attribute?: string
  /** Default screenshot file name (slugified page title). Only set when `type === 'screenshot'`. */
  name?: string
  /** Default failure threshold (0..1). Only set when `type === 'screenshot'`. */
  threshold?: number
}

export interface AssertionSpec {
  type: AssertionType
  /** Required for element-scoped assertions; omitted for page-level (`screenshot`). */
  target?: Locator
  expected?: string | number
  attribute?: string
  /** Screenshot output file name (without extension). */
  name?: string
  /** Screenshot failure threshold (0..1). */
  threshold?: number
}

export interface ElementSnapshot {
  tagName: string
  attributes: Record<string, string>
  textContent: string
}

export interface RecordedAction {
  actionId: string
  sessionId: string
  sequenceNumber: number
  type: ActionType
  timestamp: number
  pageUrl: string
  pageTitle?: string
  target?: {
    primaryLocator: ScoredLocator
    fallbackLocators: ScoredLocator[]
    /**
     * All scored candidates the engine considered (sorted by score desc), surfaced
     * so users can pick a different locator without re-running the engine. Optional
     * for backward compat with actions recorded before P1.
     */
    allCandidates?: ScoredLocator[]
    elementSnapshot: ElementSnapshot
    shadowContext?: ShadowContext
    shadowClosed?: boolean
    frameContext?: FrameContext
    /** True when the user manually picked a different locator candidate. */
    userOverridden?: boolean
    /**
     * Locator-quality signal computed at capture time. Present only when the
     * level is not `ok` (an acceptable locator stores nothing). Optional for
     * backward compat — the UI falls back to `classifyStep` when absent.
     */
    quality?: LocatorQuality
    /** Constraint-filter rejections with reasons — surfaced in the locator detail UI. */
    diagnostics?: RejectedCandidate[]
    /** Structural identity captured at record time — self-healing raw material. */
    fingerprint?: ElementFingerprint
  }
  elementSnapshot?: ElementSnapshot
  payload?: Record<string, unknown>
  annotation?: string
  /**
   * Quality signal for the `none` case, where the engine produced no locator
   * and therefore `target` is undefined. Present only when an element was
   * targeted but no locator could be computed.
   */
  quality?: LocatorQuality
}

export interface CapturedEvent {
  type: ActionType
  target: {
    locatorBundle: LocatorBundle | null
    elementSnapshot: ElementSnapshot
  } | null
  payload?: Record<string, unknown>
  timestamp: number
  pageMetadata: {
    url: string
    title: string
  }
}
