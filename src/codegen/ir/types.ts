import type { ShadowContext, FrameContext } from '@shared/types/locator'

export type IRActionType = 'navigate' | 'click' | 'fill' | 'assert' | 'keypress' | 'network'

/** TS-level parameter type used when rendering inferred method signatures. */
export type IRParamType = 'string' | 'number' | 'boolean'

/**
 * Per-fallback record carried into the IR so adapters can render each one
 * with the idiomatic call (e.g. `getByLabel(...)` instead of a raw selector).
 */
export interface IRFallback {
  strategy: string
  locatorValue: string
}

/**
 * Snapshot of the recorded element's salient attributes at capture time.
 * Used today to power `// Fallbacks: ...` comments and the side-panel badge;
 * future versions will feed an AI-driven recovery layer.
 */
export interface IRElementSnapshot {
  localName: string
  textContent?: string
  className?: string
  id?: string
  testId?: string
  role?: string
}

export interface IRElement {
  name: string
  locatorStrategy: string
  locatorValue: string
  fallbackLocators?: IRFallback[]
  tagName: string
  /** Lower-cased `type` attribute when tagName === 'input' (email, password, number, checkbox, …). */
  inputType?: string
  elementSnapshot?: IRElementSnapshot
  shadowContext?: ShadowContext
  shadowClosed?: boolean
  frameContext?: FrameContext
}

export interface AssertionDetail {
  type: 'visible' | 'hidden' | 'text' | 'value' | 'attribute' | 'count' | 'screenshot'
  expected?: string | number
  attribute?: string
  /** Screenshot file name (no extension). Only set when `type === 'screenshot'`. */
  name?: string
  /** Screenshot failure threshold (0..1). Only set when `type === 'screenshot'`. */
  threshold?: number
}

/**
 * Captured request/response metadata for a `network` step.
 * Powers Playwright `page.route(...)` mock generation.
 */
export interface IRNetworkInfo {
  method: string
  url: string
  status?: number
  contentType?: string
  /** Truncated response body (max NETWORK_BODY_MAX_BYTES) — string or stringified JSON. */
  responseBody?: string
}

export interface IRStep {
  id: string
  action: IRActionType
  element?: IRElement
  value?: string
  url?: string
  pageTitle?: string
  key?: string
  annotation?: string
  assertionDetail?: AssertionDetail
  network?: IRNetworkInfo
}

export interface InferredMethod {
  name: string
  params: string[]
  /** Parallel array of TS types (defaults to all `'string'` when omitted). */
  paramTypes?: IRParamType[]
  steps: IRStep[]
}

export interface IRPage {
  name: string
  className: string
  normalizedUrl: string
  pageTitle?: string
  collisionWarning?: boolean
  steps: IRStep[]
  elements: IRElement[]
  inferredMethods?: InferredMethod[]
}

export interface IRScenario {
  name: string
  pages: IRPage[]
}

export interface IRDocument {
  sessionId: string
  scenario: IRScenario
  pages: IRPage[]
  generatedAt: number
}

export type { GeneratedFile, GeneratedCode } from '@shared/types/generated'
