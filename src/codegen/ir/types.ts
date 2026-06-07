import type { ShadowContext, FrameContext } from '@shared/types/locator'

export type IRActionType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'assert'
  | 'keypress'
  | 'network'
  | 'wait'

/** Reason an auto-detected wait was injected after a click. */
export type IRWaitReason = 'networkidle' | 'spinner' | 'element-hidden' | 'element-visible'

/**
 * Auto-detected wait emitted by the content script after a click whose
 * follow-up triggers network or spinner activity. Adapters render it as the
 * idiomatic wait helper for their framework.
 */
export interface IRWaitInfo {
  reason: IRWaitReason
  timeoutMs: number
}

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
  /** Form-control name attribute (powers sensitive-field detection). */
  fieldName?: string
  /** Lower-cased autocomplete attribute (e.g. `current-password`, `email`). */
  autocomplete?: string
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
  type:
    | 'visible'
    | 'hidden'
    | 'text'
    | 'text-contains'
    | 'value'
    | 'attribute'
    | 'count'
    | 'screenshot'
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
  wait?: IRWaitInfo
}

export interface InferredMethod {
  name: string
  params: string[]
  /** Parallel array of TS types (defaults to all `'string'` when omitted). */
  paramTypes?: IRParamType[]
  /**
   * Parallel boolean array — `true` when the param holds a sensitive value
   * (password, token, email, etc.). Adapters render secret params with env
   * var lookups + a default fallback so the value never leaks into committed
   * code. Defaults to all `false` when omitted.
   */
  paramSecret?: boolean[]
  steps: IRStep[]
}

/** A single user-visible test data parameter surfaced in the side panel. */
export interface TestDataParam {
  /** Stable parameter id, e.g. `LoginPage.login.password`. */
  key: string
  /** Camel-case parameter name as rendered in the method signature. */
  name: string
  /** Detected (or user-overridden) sensitive flag. */
  isSecret: boolean
  /** Default value substituted at call sites when no env var is set. */
  defaultValue: string
  /** When true, adapters emit `process.env.X ?? default` style lookups. */
  useEnvVar: boolean
  /** SCREAMING_SNAKE_CASE env var name (without `RECOSPEC_` prefix). */
  envVarName: string
}

/** Full test data configuration shipped from the side panel into codegen. */
export interface TestDataConfig {
  params: TestDataParam[]
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
