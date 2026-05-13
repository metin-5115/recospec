import type { CaptureConfig, Session, SessionMeta } from './session'
import type { CapturedEvent, RecordedAction, AssertionSuggestion } from './action'
import type { GeneratedCode, FrameworkId } from './generated'
import type { FrameContext, Locator, LocatorBundle, ScoredLocator, ShadowContext } from './locator'
import type { ElementSnapshot } from './action'
import type { TestDataConfig } from '@codegen/ir/types'

export type StepPatch = Partial<Pick<RecordedAction, 'payload' | 'annotation' | 'target' | 'type'>>

/** Serializable bounding-box (DOMRect cannot survive chrome.runtime.sendMessage). */
export interface SerializableRect {
  x: number
  y: number
  width: number
  height: number
}

export type LocatorValidationStatus = 'matched' | 'multiple' | 'missing' | 'cross-origin'

export interface LocatorValidationTarget {
  actionId: string
  /** Step index used for display ordering and the "Show me" overlay label. */
  index: number
  /** Human-readable label (e.g. "Login button"). */
  label: string
  primary: ScoredLocator
  fallbacks: ScoredLocator[]
  shadowContext?: ShadowContext
  frameContext?: FrameContext
}

export interface LocatorEvaluation {
  strategy: ScoredLocator['strategy']
  selector: ScoredLocator['selector']
  status: LocatorValidationStatus
  matchCount: number
}

export interface LocatorValidationResult {
  actionId: string
  index: number
  label: string
  primary: LocatorEvaluation
  /** Evaluated in order; same index as the input fallbacks. */
  fallbacks: LocatorEvaluation[]
  /** First match's bounding rect — populated when `primary.status !== 'missing'`. */
  rect?: SerializableRect
  /** True when the active page URL no longer matches the recorded URL. */
  urlMismatch?: boolean
}

export type UIToBackgroundMessage =
  | { type: 'SESSION_START'; tabId: number; metadata: SessionMeta; config: CaptureConfig }
  | { type: 'SESSION_STOP'; sessionId: string }
  | { type: 'SESSION_PAUSE'; sessionId: string }
  | { type: 'SESSION_RESUME'; sessionId: string }
  | { type: 'SESSION_DELETE'; sessionId: string }
  | { type: 'SESSION_RENAME'; sessionId: string; name: string }
  | {
      type: 'CODE_GENERATE'
      sessionId: string
      framework: FrameworkId
      includeMocks?: boolean
      /** When false, strip auto-detected `wait` steps before codegen. */
      autoWaitEnabled?: boolean
      /** Override inferred method names. Keyed by `${pageClassName}.${oldName}`. */
      methodRenames?: Record<string, string>
      /** User-edited test data parameters (env-var emission, default values). */
      testData?: TestDataConfig
      /** When true, emit Gherkin `.feature` + step definitions alongside the page objects. */
      bdd?: boolean
    }
  | { type: 'ASSERTION_PROBE_START'; sessionId: string }
  | { type: 'ASSERTION_PROBE_STOP'; sessionId: string }
  | {
      type: 'ASSERTION_ADD'
      sessionId: string
      suggestion: AssertionSuggestion
      customExpected?: string
      locatorBundle: LocatorBundle | null
      elementSnapshot: ElementSnapshot
      pageMetadata: { url: string; title: string }
    }
  | { type: 'STEPS_REORDERED'; sessionId: string; orderedActionIds: string[] }
  | { type: 'STEP_UPDATED'; sessionId: string; actionId: string; patch: StepPatch }
  | { type: 'STEP_DELETED'; sessionId: string; actionId: string }
  | {
      type: 'VALIDATE_LOCATORS'
      sessionId: string
      recordedUrl?: string
      targets: LocatorValidationTarget[]
    }
  | {
      type: 'HIGHLIGHT_LOCATOR'
      sessionId: string
      locator: Locator
      shadowContext?: ShadowContext
      frameContext?: FrameContext
      label?: string
    }
  | {
      type: 'SESSION_ITERATION_ACCEPT'
      sessionId: string
      parentSessionId: string
    }
  | {
      type: 'SESSION_ITERATION_DISMISS'
      sessionId: string
    }

export type BackgroundToUIMessage =
  | { type: 'STEP_RECORDED'; sessionId: string; step: RecordedAction }
  | { type: 'STEPS_SYNCED'; sessionId: string; steps: RecordedAction[] }
  | { type: 'SESSION_STATE_CHANGED'; session: Session }
  | { type: 'SESSION_DELETED'; sessionId: string }
  | { type: 'CODE_GENERATED'; sessionId: string; code: GeneratedCode }
  | { type: 'CODE_GENERATE_ERROR'; sessionId: string; error: string }
  | {
      type: 'ASSERTION_SUGGESTIONS'
      locatorBundle: LocatorBundle | null
      elementSnapshot: ElementSnapshot
      suggestions: AssertionSuggestion[]
      pageMetadata: { url: string; title: string }
      /** PNG data URL of the visible tab; populated when a `screenshot` suggestion is offered. */
      screenshotDataUrl?: string
    }
  | {
      type: 'LOCATOR_VALIDATION_RESULT'
      sessionId: string
      results: LocatorValidationResult[]
      durationMs: number
      /** Active page URL at the moment of validation. */
      pageUrl: string
      /** Set when validation could not run (no active tab, content script missing, etc.). */
      error?: string
      /** Truncated `targets.length` when the request exceeded the cap. */
      truncated?: number
    }
  | {
      type: 'SESSION_ITERATION_SUGGESTED'
      /** Currently-recording session. */
      sessionId: string
      /** Matched prior session — proposed parent for the new iteration. */
      parentSessionId: string
      parentName: string
      parentIterationNumber: number
      /** Recorded `stoppedAt` (or `startedAt`) of the parent — for "last recorded …". */
      parentTimestamp: number
    }

export type ContentToBackgroundMessage =
  | { type: 'EVENT_CAPTURED'; sessionId: string; event: CapturedEvent }
  | {
      type: 'ASSERTION_SUGGESTION'
      sessionId: string
      locatorBundle: LocatorBundle | null
      elementSnapshot: ElementSnapshot
      suggestions: AssertionSuggestion[]
      pageMetadata: { url: string; title: string }
    }
  | {
      type: 'LOCATOR_VALIDATION_RESPONSE'
      sessionId: string
      results: LocatorValidationResult[]
      durationMs: number
      pageUrl: string
    }

export type BackgroundToContentMessage =
  | { type: 'START_CAPTURE'; sessionId: string; config: CaptureConfig }
  | { type: 'STOP_CAPTURE'; sessionId: string }
  | { type: 'START_ASSERTION_PROBE'; sessionId: string }
  | { type: 'STOP_ASSERTION_PROBE'; sessionId: string }
  | {
      type: 'VALIDATE_LOCATORS_RUN'
      sessionId: string
      targets: LocatorValidationTarget[]
    }
  | {
      type: 'HIGHLIGHT_LOCATOR_ON_PAGE'
      locator: Locator
      shadowContext?: ShadowContext
      frameContext?: FrameContext
      label?: string
      durationMs: number
    }
