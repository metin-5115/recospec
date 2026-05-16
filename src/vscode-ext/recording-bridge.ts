import type { BrowserContext, Worker } from '@playwright/test'
import type { JsonExportPayload } from '@codegen/export/json-export'

export class RecordingClosedError extends Error {
  constructor() {
    super('Chromium was closed before Stop — no recording extracted.')
    this.name = 'RecordingClosedError'
  }
}

export class NoStepsRecordedError extends Error {
  constructor() {
    super('No steps recorded. Start a session in the side panel before stopping.')
    this.name = 'NoStepsRecordedError'
  }
}

/**
 * Resolve the PlayForge background service worker for the supplied context.
 * Playwright registers each MV3 service worker as a `Worker`; in the
 * single-extension launch we do, the only entry is ours. We wait up to
 * `timeoutMs` for registration since the SW may take a beat to spin up.
 */
export async function findServiceWorker(
  context: BrowserContext,
  timeoutMs = 10_000,
): Promise<Worker> {
  const existing = context.serviceWorkers()[0]
  if (existing) return existing

  return new Promise<Worker>((resolve, reject) => {
    const timer = setTimeout(() => {
      context.off('serviceworker', onWorker)
      reject(
        new Error(
          `Timed out (${timeoutMs}ms) waiting for the PlayForge service worker. ` +
            'Confirm `chrome-ext/manifest.json` is valid and `pnpm build` ran cleanly.',
        ),
      )
    }, timeoutMs)

    const onWorker = (w: Worker) => {
      clearTimeout(timer)
      context.off('serviceworker', onWorker)
      resolve(w)
    }
    context.on('serviceworker', onWorker)
  })
}

/**
 * Pull the latest session as a `JsonExportPayload` by evaluating the
 * service-worker global injected by `src/background/index.ts`. The handler
 * is registered as `self.__playforgeExport` once the message router has
 * finished setup, and reads sessions + actions from IndexedDB (Dexie).
 *
 * Throws `NoStepsRecordedError` when the SW reports no actions or no
 * session, so the orchestrator can surface a friendly message instead of
 * writing an empty file.
 */
export async function extractFromServiceWorker(
  context: BrowserContext,
  sessionId?: string,
): Promise<JsonExportPayload> {
  const worker = await findServiceWorker(context)

  // The eval payload is intentionally permissive — it converts thrown
  // errors into a tagged shape we can re-throw on the VS Code side with a
  // useful message. Playwright otherwise stringifies them as "Error: e".
  const result = await worker.evaluate(async (filterSessionId: string | undefined) => {
    type Exporter = (id?: string) => Promise<unknown>
    const fn = (globalThis as unknown as { __playforgeExport?: Exporter }).__playforgeExport
    if (typeof fn !== 'function') {
      return { ok: false as const, error: 'PlayForge service worker has no export handler' }
    }
    try {
      const payload = await fn(filterSessionId)
      return { ok: true as const, payload }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false as const, error: message }
    }
  }, sessionId)

  if (!result.ok) {
    throw new Error(`Export failed: ${result.error}`)
  }
  if (!result.payload) {
    throw new NoStepsRecordedError()
  }
  return result.payload as JsonExportPayload
}

export interface ExportSettlement {
  outcome: 'stopped' | 'closed'
}

/**
 * Resolve when the user signals "Stop" via the host (`stopSignal`) or when
 * Chromium is closed before that signal fires. Closing-before-stop is the
 * key edge case from the sprint brief — `context.on('close')` must always
 * resolve the wait, never leave it hanging.
 *
 * The function does not extract the JSON itself; the caller decides what
 * to do based on the outcome.
 */
export function waitForExport(
  context: BrowserContext,
  stopSignal: Promise<void>,
): Promise<ExportSettlement> {
  return new Promise<ExportSettlement>((resolve) => {
    let settled = false
    const settle = (outcome: ExportSettlement['outcome']) => {
      if (settled) return
      settled = true
      resolve({ outcome })
    }
    context.once('close', () => settle('closed'))
    stopSignal.then(() => settle('stopped')).catch(() => settle('stopped'))
  })
}
