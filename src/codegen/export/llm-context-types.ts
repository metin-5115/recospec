import type { FrameworkId, LlmContextTask } from '@shared/types/generated'
import type { IRParamType } from '../ir/types'

/** Format version stamped into both renderings so a consumer can detect layout changes. */
export const LLM_CONTEXT_VERSION = 1 as const

export interface LlmPage {
  /** Short id (`P1`, `P2`, …) used by elements and methods. */
  id: string
  className: string
  /** Route relative to {@link LlmContext.base}. */
  path: string
  title?: string
}

export interface LlmLocator {
  /** Abbreviated strategy (`tid`, `aria`, `role`, `css`, …). */
  strategy: string
  value: string
}

/** Healing raw material: what the element looked like when it was recorded. */
export interface LlmFingerprint {
  /** Semantic ancestor chain (`main>form>input`); undefined when only div/span ancestors exist. */
  path?: string
  neighbors: string[]
  /** `x,y` viewport ratio with two decimals; undefined when layout was unavailable. */
  box?: string
  /** Stable identity attributes as `name:value` pairs. */
  attrs: string[]
}

export interface LlmElement {
  /** Short id (`e1`, `e2`, …) used by steps. */
  id: string
  page: string
  /** Page-object property name chosen by the codegen planner. */
  name: string
  tag: string
  inputType?: string
  role?: string
  /** Accessible name or trimmed visible text. */
  label?: string
  locator: LlmLocator
  fallbacks: LlmLocator[]
  isSecret: boolean
  /** The primary locator leans on a positional index, a generated class or a transient state class. */
  isFragile: boolean
  fingerprint?: LlmFingerprint
}

export interface LlmStep {
  n: number
  action: string
  el?: string
  /** Pre-formatted argument (route, key, value, wait spec, assertion). */
  value?: string
}

export interface LlmParam {
  name: string
  type: IRParamType
  isSecret: boolean
}

export interface LlmMethod {
  page: string
  name: string
  params: LlmParam[]
  /** Flow step numbers the method covers. */
  steps: number[]
}

export interface LlmRequest {
  method: string
  path: string
  status?: number
  /** Abbreviated content type (`json`, `html`, `text`, or the raw value). */
  type?: string
  /** How many identical calls were recorded. */
  count: number
}

export interface LlmContext {
  flow: string
  framework?: FrameworkId
  task: LlmContextTask
  /** Origin shared by every page and request path. */
  base: string
  pages: LlmPage[]
  elements: LlmElement[]
  steps: LlmStep[]
  methods: LlmMethod[]
  requests: LlmRequest[]
  /** Empty when instructions are disabled. */
  rules: string[]
  /** Single-line task statement; undefined when instructions are disabled. */
  ask?: string
  redactSecrets: boolean
}
