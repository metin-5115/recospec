import * as vscode from 'vscode'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JsonExportPayload } from '@codegen/export/json-export'
import {
  BundledExtensionMissingError,
  launchChromium,
  resolveBundledExtensionPath,
} from '../browser-controller'
import { extractFromServiceWorker, NoStepsRecordedError, waitForExport } from '../recording-bridge'
import { resolveWorkspace } from '../workspace-utils'
import { getSessionsDir } from '../tree-provider'
import { applyJsonAtPath } from './apply-json'
import type { RecospecStatusBar } from '../status-bar'

/**
 * Record orchestrator (Flow 1):
 *
 *   1. Resolve the workspace and the bundled Chrome extension path.
 *   2. Launch Chromium with Recospec pre-loaded.
 *   3. Show a non-modal info message with "Stop & Apply" / "Cancel".
 *   4. Race the user's button choice against `context.on('close')`.
 *   5. On Stop, pull the latest session via the SW global, persist the
 *      JSON to a temp file, and hand off to the standard Apply pipeline.
 *   6. On close-before-stop, surface a clear "closed before stop" message
 *      and skip the apply step (the SW is gone, no payload available).
 */
export function registerRecordCommand(
  statusBar: RecospecStatusBar,
  output: vscode.OutputChannel,
  context: vscode.ExtensionContext,
): vscode.Disposable {
  return vscode.commands.registerCommand('recospec.record', async () => {
    const ws = await resolveWorkspace()
    if (!ws) return

    let extensionPath: string
    try {
      extensionPath = resolveBundledExtensionPath(context.extensionUri.fsPath)
    } catch (err) {
      if (err instanceof BundledExtensionMissingError) {
        void vscode.window.showErrorMessage(err.message)
        output.appendLine(`[recospec] ERROR: ${err.message}`)
        return
      }
      throw err
    }

    output.show(true)
    output.appendLine('')
    output.appendLine(`[recospec] record: launching Chromium with ${extensionPath}`)

    statusBar.setBusy('recording')
    let launched
    try {
      launched = await launchChromium({ extensionPath })
    } catch (err) {
      const message = (err as Error).message
      output.appendLine(`[recospec] ERROR: ${message}`)
      void vscode.window.showErrorMessage(`Recospec: failed to launch Chromium — ${message}`)
      statusBar.setIdle()
      return
    }

    output.appendLine('[recospec] Chromium launched — record your flow, then click Stop.')

    let stopResolve!: () => void
    const stopSignal = new Promise<void>((r) => {
      stopResolve = r
    })

    // The notification action button is the user's "Stop" trigger. It
    // returns once a button is clicked or the notification is dismissed;
    // we coerce "Cancel" / dismiss into a separate code path so the user
    // can bail without applying anything.
    const notificationPromise = vscode.window
      .showInformationMessage(
        'Recospec: recording in progress. Run the flow in Chromium, then click ' +
          'Stop in the side panel before pressing "Stop & Apply" here.',
        { modal: false },
        'Stop & Apply',
        'Cancel',
      )
      .then((choice) => {
        if (choice === 'Stop & Apply') stopResolve()
        return choice
      })

    const settlement = await waitForExport(launched.context, stopSignal)

    if (settlement.outcome === 'closed') {
      output.appendLine('[recospec] Chromium was closed before Stop — no payload to apply.')
      void vscode.window.showWarningMessage(
        'Recospec: Chromium was closed before Stop — no recording was captured.',
      )
      statusBar.setIdle()
      return
    }

    // outcome === 'stopped' — pull the JSON, then close the browser. We do
    // it in this order so the SW is still alive when we evaluate.
    let payload: JsonExportPayload | null = null
    try {
      payload = await extractFromServiceWorker(launched.context)
      output.appendLine(
        `[recospec] extracted session=${payload.session.name} actions=${payload.actions.length}`,
      )
    } catch (err) {
      if (err instanceof NoStepsRecordedError) {
        output.appendLine('[recospec] No steps recorded — nothing to apply.')
        void vscode.window.showInformationMessage(
          'Recospec: no steps recorded. Start a session in the side panel before stopping.',
        )
      } else {
        const message = (err as Error).message
        output.appendLine(`[recospec] ERROR: ${message}`)
        void vscode.window.showErrorMessage(`Recospec: extract failed — ${message}`)
      }
    } finally {
      await launched.context.close().catch(() => {
        // Browser may already be closing — swallow.
      })
      // Make sure the leftover notification disappears.
      void notificationPromise
      statusBar.setIdle()
    }

    if (!payload) return

    const jsonPath = saveExportToWorkspace(payload, ws.projectDir)
    output.appendLine(`[recospec] wrote recording → ${jsonPath}`)

    await applyJsonAtPath({
      jsonPath,
      projectDir: ws.projectDir,
      statusBar,
      output,
    })
  })
}

/**
 * Write the export payload to `<projectDir>/.recospec/sessions/`. The audit
 * copy lives next to the project so the Recordings tree view can list it
 * later and the user can re-apply a past recording without re-recording.
 * The same path is fed straight into `applyJsonAtPath`, so we do not also
 * write a temp copy — one source of truth keeps deletions consistent.
 */
function saveExportToWorkspace(payload: JsonExportPayload, projectDir: string): string {
  const dir = getSessionsDir(projectDir)
  mkdirSync(dir, { recursive: true })
  const slug = (payload.session.name || 'recording')
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '')
    .slice(0, 60)
  const filename = `${slug}_${Date.now()}.json`
  const path = join(dir, filename)
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
  return path
}
