import type { CaptureConfig, Session, SessionMeta } from './session'
import type { CapturedEvent, RecordedAction } from './action'
import type { GeneratedCode } from './generated'

export type UIToBackgroundMessage =
  | { type: 'SESSION_START'; tabId: number; metadata: SessionMeta; config: CaptureConfig }
  | { type: 'SESSION_STOP'; sessionId: string }
  | { type: 'CODE_GENERATE'; sessionId: string; framework: 'playwright-ts' }

export type BackgroundToUIMessage =
  | { type: 'STEP_RECORDED'; sessionId: string; step: RecordedAction }
  | { type: 'SESSION_STATE_CHANGED'; session: Session }
  | { type: 'CODE_GENERATED'; sessionId: string; code: GeneratedCode }
  | { type: 'CODE_GENERATE_ERROR'; sessionId: string; error: string }

export type ContentToBackgroundMessage = {
  type: 'EVENT_CAPTURED'
  sessionId: string
  event: CapturedEvent
}

export type BackgroundToContentMessage =
  | { type: 'START_CAPTURE'; sessionId: string; config: CaptureConfig }
  | { type: 'STOP_CAPTURE'; sessionId: string }
