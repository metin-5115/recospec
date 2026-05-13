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
  /**
   * Position of this session within its version tree. Root sessions are `1`;
   * iterations bumped via {@link createIteration} get `parent.iterationNumber + 1`.
   * Added in DB v2; older rows are backfilled to `1`.
   */
  iterationNumber: number
  /**
   * Parent session in the version tree, or undefined for root sessions.
   * `getVersions(rootId)` walks this pointer to assemble the full tree.
   */
  parentSessionId?: string
  /**
   * Deterministic shape-hash of the flow (start URL + the first 3 step types
   * + their locator strategies). Two sessions with the same signature are
   * considered iterations of the same logical flow.
   */
  flowSignature: string
}
