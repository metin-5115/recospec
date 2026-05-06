export type SessionState = 'recording' | 'paused' | 'stopped' | 'archived'

export interface SessionMeta {
  userAgent: string
  viewport: { width: number; height: number }
  timezone: string
}

export interface CaptureConfig {
  captureClicks: boolean
  captureInputs: boolean
  captureNavigation: boolean
}

export interface Session {
  sessionId: string
  name: string
  state: SessionState
  startUrl: string
  startedAt: number
  stoppedAt?: number
  tabId?: number
  metadata: SessionMeta
  config: CaptureConfig
}
