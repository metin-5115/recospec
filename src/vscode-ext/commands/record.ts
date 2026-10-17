import * as vscode from 'vscode'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JsonExportPayload } from '@codegen/export/json-export'
import {
  BundledExtensionMissingError,
  launchChromium,
  resolveBundledExtensionPath,
} from '../browser-controller'
import { extractFromServiceWorker, NoStepsRecordedError, waitForExport } from '../recording-bridge'
import { ChromiumMissingError, PlaywrightMissingError } from '../playwright-loader'
import { PLAYWRIGHT_INSTALL_COMMAND } from '@shared/constants'
import { resolveWorkspace } from '../workspace-utils'
import { ensureSessionsDirIgnored } from '../session-files'
import { getSessionsDir } from '../tree-provider'
import { applyJsonAtPath } from './apply-json'
import type { RecospecStatusBar } from '../status-bar'

const COPY_INSTALL_COMMAND = 'Copy install command'
const OPEN_TERMINAL = 'Open terminal'

/**
 * Explains what is missing and lets the user fix it in one click. The terminal opens with the
 * command typed but not executed, so nothing is installed without an explicit Enter.
 */
async function offerPlaywrightInstall(
  err: PlaywrightMissingError | ChromiumMissingError,
  projectDir: string,
): Promise<void> {
  const headline =
    err instanceof PlaywrightMissingError
      ? 'Recospec: Playwright is not installed in this project.'
      : 'Recospec: Playwright is installed but its Chromium browser is missing.'
  const choice = await vscode.window.showErrorMessage(
    `${headline} Run: ${PLAYWRIGHT_INSTALL_COMMAND}`,
    COPY_INSTALL_COMMAND,
    OPEN_TERMINAL,
  )
  if (choice === COPY_INSTALL_COMMAND) {
    await vscode.env.clipboard.writeText(PLAYWRIGHT_INSTALL_COMMAND)
  } else if (choice === OPEN_TERMINAL) {
    const terminal = vscode.window.createTerminal({ name: 'Recospec', cwd: projectDir })
    terminal.show()
    terminal.sendText(PLAYWRIGHT_INSTALL_COMMAND, false)
  }
}

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
      launched = await launchChromium({
        extensionPath,
        searchDirs: [ws.projectDir, context.extensionUri.fsPath],
      })
    } catch (err) {
      const message = (err as Error).message
      output.appendLine(`[recospec] ERROR: ${message}`)
      statusBar.setIdle()
      if (err instanceof PlaywrightMissingError || err instanceof ChromiumMissingError) {
        void offerPlaywrightInstall(err, ws.projectDir)
      } else {
        void vscode.window.showErrorMessage(`Recospec: failed to launch Chromium — ${message}`)
      }
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
  ensureSessionsDirIgnored(dir)
  const slug = (payload.session.name || 'recording')
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '')
    .slice(0, 60)
  const filename = `${slug}_${Date.now()}.json`
  const path = join(dir, filename)
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
  return path
}
