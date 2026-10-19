import type { CaptureConfig, Session, SessionMeta } from './session'
import type { CapturedEvent, RecordedAction, AssertionSuggestion } from './action'
import type { GeneratedCode, FrameworkId, OutputSelection } from './generated'
import type { FrameContext, Locator, LocatorBundle, ScoredLocator, ShadowContext } from './locator'
import type { ElementSnapshot } from './action'
import type { TestDataConfig, TemplateParamMode } from '@codegen/ir/types'
import type { ComposedParamMode } from '@codegen/planner/template-modes'
import type { JsonExportPayload } from '@codegen/export/json-export'

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
      /** When false, keep fallback locators as comments instead of wiring them in. Defaults to true. */
      selfHealing?: boolean
      /** When false, skip the auto-added "flow ended on this URL" assertion. Defaults to true. */
      finalStateAssertion?: boolean
      /** When false, strip auto-detected `wait` steps before codegen. */
      autoWaitEnabled?: boolean
      /** Override inferred method names. Keyed by `${pageClassName}.${oldName}`. */
      methodRenames?: Record<string, string>
      /** User-edited test data parameters (env-var emission, default values). */
      testData?: TestDataConfig
      /** When true, emit Gherkin `.feature` + step definitions alongside the page objects. */
      bdd?: boolean
      /** Which file groups to emit (page objects / test / scaffold). Defaults to all. */
      selection?: OutputSelection
      /**
       * Per-element render mode for container-anchored composed locators, keyed
       * by `locatorValue`: `scoped` (hardcoded label, default) or `param` (label
       * becomes a `select<Name>(name)` method parameter).
       */
      composedModes?: Record<string, ComposedParamMode>
      /** Per-element render mode for template (data-value) locators, keyed by `locatorValue`. */
      templateModes?: Record<string, TemplateParamMode>
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
      /**
       * When set, the new assertion is inserted at `afterActionId + 1` and
       * every subsequent action's `sequenceNumber` is renumbered. Powers the
       * "Add Assertion" button on each step row after recording stops.
       */
      afterActionId?: string
    }
  /** Begin replaying every recorded action of a stopped session on the active tab. */
  | { type: 'REPLAY_REQUEST'; sessionId: string }
  /** Caller-initiated cancellation. Best-effort — in-flight DOM ops complete. */
  | { type: 'REPLAY_ABORT'; sessionId: string }
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
  /**
   * Out-of-band export request. The VS Code Record flow invokes
   * `handleExportRequest` directly via the service-worker global
   * (`self.__recospecExport`) because `chrome.runtime.sendMessage` cannot
   * deliver to the sender. The case is wired into the message router so
   * future surfaces (web playground, headless harness) can use the same
   * typed contract through the message bus.
   */
  | { type: 'EXPORT_REQUEST'; sessionId?: string }

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
  /** Reply to `EXPORT_REQUEST`. `payload === null` means no recording was found. */
  | { type: 'EXPORT_RESPONSE'; payload: JsonExportPayload | null; error?: string }
  /**
   * Background detected that a Dexie write hit the IndexedDB quota.
   * Side panel surfaces this through the {@link IndexedDBQuotaError} branch
   * of the ErrorBoundary so the user can free space from History.
   */
  | { type: 'STORAGE_QUOTA_EXCEEDED'; sessionId?: string }
  /** Replay just started for `sessionId` — UI flips into "replaying" state. */
  | { type: 'REPLAY_STARTED'; sessionId: string; totalSteps: number }
  /** Background is about to attempt one action. UI marks it `running`. */
  | { type: 'REPLAY_STEP_STARTED'; sessionId: string; actionId: string; index: number }
  /** Outcome for one action. `error` only set when `status === 'fail'`. */
  | {
      type: 'REPLAY_STEP_RESULT'
      sessionId: string
      actionId: string
      index: number
      status: 'pass' | 'fail' | 'skipped'
      error?: string
    }
  /** Final replay tally. `aborted` true when the user cancelled mid-run. */
  | {
      type: 'REPLAY_DONE'
      sessionId: string
      totalSteps: number
      passed: number
      failed: number
      skipped: number
      aborted?: boolean
      error?: string
    }

export type ContentToBackgroundMessage =
  | { type: 'EVENT_CAPTURED'; sessionId: string; event: CapturedEvent }
  /**
   * A freshly-loaded content script announcing it is listening. Sent on every
   * document load (including after a full-page navigation). The background uses
   * it to resume capture on the new page when a recording is active for the
   * sender's tab — without it, recording silently stops after any navigation.
   */
  | { type: 'CONTENT_READY'; url: string }
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
  /** Reply from the content script after it ran one replay step. */
  | {
      type: 'REPLAY_STEP_RESPONSE'
      sessionId: string
      actionId: string
      status: 'pass' | 'fail' | 'skipped'
      error?: string
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
  /**
   * Run one replay step against the live DOM. Content script resolves the
   * primary locator (or walks fallbacks on miss) and dispatches the
   * appropriate event, then replies via `REPLAY_STEP_RESPONSE`.
   */
  | {
      type: 'REPLAY_STEP_RUN'
      sessionId: string
      actionId: string
      actionType: import('./action').ActionType
      primary: Locator
      fallbacks: Locator[]
      shadowContext?: ShadowContext
      frameContext?: FrameContext
      payload?: Record<string, unknown>
    }
