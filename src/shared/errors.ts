/**
 * Typed runtime errors Recospec surfaces to the user. Each subclass carries
 * a stable `code`, a short `userMessage` for the side-panel ErrorBoundary, and
 * a `recoveryAction` discriminator the UI dispatches on. The pattern matches
 * the friendly Error classes shipped in `src/vscode-ext/recording-bridge.ts`
 * (`RecordingClosedError`, `NoStepsRecordedError`).
 */

export type RecoveryAction = 'retry-service-worker' | 'navigate-history' | 'reload-tab'

export abstract class RecospecError extends Error {
  abstract readonly code: string
  abstract readonly userMessage: string
  abstract readonly recoveryAction: RecoveryAction
}

export class ServiceWorkerColdError extends RecospecError {
  readonly code = 'SERVICE_WORKER_COLD'
  readonly userMessage =
    'Recospec’s background worker went to sleep. Click Record again to wake it up.'
  readonly recoveryAction = 'retry-service-worker' as const

  constructor(cause?: unknown) {
    super('Service worker did not respond — it may be cold-starting.')
    this.name = 'ServiceWorkerColdError'
    if (cause !== undefined) this.cause = cause
  }
}

export class IndexedDBQuotaError extends RecospecError {
  readonly code = 'INDEXEDDB_QUOTA'
  readonly userMessage =
    'Local storage is full. Clear old sessions from the History tab to record a new one.'
  readonly recoveryAction = 'navigate-history' as const

  constructor(cause?: unknown) {
    super('IndexedDB quota exceeded — Dexie write rejected.')
    this.name = 'IndexedDBQuotaError'
    if (cause !== undefined) this.cause = cause
  }
}

export class ContentScriptMissingError extends RecospecError {
  readonly code = 'CONTENT_SCRIPT_MISSING'
  readonly userMessage =
    'Recospec cannot reach this tab. Reload the tab so the recorder can re-inject.'
  readonly recoveryAction = 'reload-tab' as const
  readonly tabId: number

  constructor(tabId: number, cause?: unknown) {
    super(`Content script is not loaded in tab ${tabId}.`)
    this.name = 'ContentScriptMissingError'
    this.tabId = tabId
    if (cause !== undefined) this.cause = cause
  }
}

/**
 * True when an unknown thrown value originated from an IndexedDB quota
 * exceeded condition. Native errors come through as `DOMException` with
 * `name === 'QuotaExceededError'`; Dexie wraps them in `DexieError` and
 * preserves the same name on `.name` or on `.inner.name`.
 */
export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: unknown; inner?: { name?: unknown } }
  if (e.name === 'QuotaExceededError') return true
  if (e.inner && e.inner.name === 'QuotaExceededError') return true
  return false
}

/**
 * Recognize Chrome's "Receiving end does not exist" / "Could not establish
 * connection" sendMessage rejection. Used to disambiguate a cold-SW reject
 * from generic runtime failures.
 */
export function isPortDisconnectedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return (
    msg.includes('Receiving end does not exist') ||
    msg.includes('Could not establish connection') ||
    msg.includes('message port closed')
  )
}
