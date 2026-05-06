import type { CaptureConfig, Session, SessionMeta } from './session'
import type { CapturedEvent, RecordedAction, AssertionSuggestion } from './action'
import type { GeneratedCode } from './generated'
import type { LocatorBundle } from './locator'
import type { ElementSnapshot } from './action'

export type UIToBackgroundMessage =
  | { type: 'SESSION_START'; tabId: number; metadata: SessionMeta; config: CaptureConfig }
  | { type: 'SESSION_STOP'; sessionId: string }
  | { type: 'SESSION_PAUSE'; sessionId: string }
  | { type: 'SESSION_RESUME'; sessionId: string }
  | { type: 'SESSION_DELETE'; sessionId: string }
  | { type: 'SESSION_RENAME'; sessionId: string; name: string }
  | { type: 'CODE_GENERATE'; sessionId: string; framework: 'playwright-ts' }
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

export type BackgroundToUIMessage =
  | { type: 'STEP_RECORDED'; sessionId: string; step: RecordedAction }
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

export type BackgroundToContentMessage =
  | { type: 'START_CAPTURE'; sessionId: string; config: CaptureConfig }
  | { type: 'STOP_CAPTURE'; sessionId: string }
  | { type: 'START_ASSERTION_PROBE'; sessionId: string }
  | { type: 'STOP_ASSERTION_PROBE'; sessionId: string }
