import type { Locator, LocatorBundle, ScoredLocator, ShadowContext, FrameContext } from './locator'

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
    elementSnapshot: ElementSnapshot
    shadowContext?: ShadowContext
    shadowClosed?: boolean
    frameContext?: FrameContext
  }
  elementSnapshot?: ElementSnapshot
  payload?: Record<string, unknown>
  annotation?: string
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
