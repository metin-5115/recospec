import type { CaptureConfig, Session, SessionMeta } from './session'
import type { CapturedEvent, RecordedAction } from './action'

export type UIToBackgroundMessage =
  | { type: 'SESSION_START'; tabId: number; metadata: SessionMeta; config: CaptureConfig }
  | { type: 'SESSION_STOP'; sessionId: string }

export type BackgroundToUIMessage =
  | { type: 'STEP_RECORDED'; sessionId: string; step: RecordedAction }
  | { type: 'SESSION_STATE_CHANGED'; session: Session }

export type ContentToBackgroundMessage = {
  type: 'EVENT_CAPTURED'
  sessionId: string
  event: CapturedEvent
}

export type BackgroundToContentMessage =
  | { type: 'START_CAPTURE'; sessionId: string; config: CaptureConfig }
  | { type: 'STOP_CAPTURE'; sessionId: string }
