import * as vscode from 'vscode'
import { runInit } from '@/cli/commands/init'
import { resolveWorkspace } from '../workspace-utils'
import type { RecospecStatusBar } from '../status-bar'

/**
 * Wraps `runInit` so the user can pin a framework into `.recospecrc.json`
 * without dropping to a terminal. Refuses to overwrite an existing rc unless
 * the user confirms.
 */
export function registerInitCommand(statusBar: RecospecStatusBar): vscode.Disposable {
  return vscode.commands.registerCommand('recospec.init', async () => {
    const ws = await resolveWorkspace()
    if (!ws) return

    statusBar.setBusy('init')
    try {
      await runInit({ projectDir: ws.projectDir, force: false })
      void vscode.window.showInformationMessage('Recospec: wrote .recospecrc.json')
    } catch (err) {
      const message = (err as Error).message
      if (message.includes('already exists')) {
        const choice = await vscode.window.showWarningMessage(
          '.recospecrc.json already exists. Overwrite?',
          { modal: true },
          'Overwrite',
        )
        if (choice !== 'Overwrite') return
        try {
          await runInit({ projectDir: ws.projectDir, force: true })
          void vscode.window.showInformationMessage('Recospec: overwrote .recospecrc.json')
        } catch (retryErr) {
          void vscode.window.showErrorMessage(
            `Recospec init failed: ${(retryErr as Error).message}`,
          )
        }
      } else {
        void vscode.window.showErrorMessage(`Recospec init failed: ${message}`)
      }
    } finally {
      statusBar.setIdle()
    }
  })
}
