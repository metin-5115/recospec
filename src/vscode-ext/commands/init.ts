import * as vscode from 'vscode'
import { runInit } from '@/cli/commands/init'
import { resolveWorkspace } from '../workspace-utils'
import type { PlayforgeStatusBar } from '../status-bar'

/**
 * Wraps `runInit` so the user can pin a framework into `.playforgerc.json`
 * without dropping to a terminal. Refuses to overwrite an existing rc unless
 * the user confirms.
 */
export function registerInitCommand(statusBar: PlayforgeStatusBar): vscode.Disposable {
  return vscode.commands.registerCommand('playforge.init', async () => {
    const ws = await resolveWorkspace()
    if (!ws) return

    statusBar.setBusy('init')
    try {
      await runInit({ projectDir: ws.projectDir, force: false })
      void vscode.window.showInformationMessage('PlayForge: wrote .playforgerc.json')
    } catch (err) {
      const message = (err as Error).message
      if (message.includes('already exists')) {
        const choice = await vscode.window.showWarningMessage(
          '.playforgerc.json already exists. Overwrite?',
          { modal: true },
          'Overwrite',
        )
        if (choice !== 'Overwrite') return
        try {
          await runInit({ projectDir: ws.projectDir, force: true })
          void vscode.window.showInformationMessage('PlayForge: overwrote .playforgerc.json')
        } catch (retryErr) {
          void vscode.window.showErrorMessage(
            `PlayForge init failed: ${(retryErr as Error).message}`,
          )
        }
      } else {
        void vscode.window.showErrorMessage(`PlayForge init failed: ${message}`)
      }
    } finally {
      statusBar.setIdle()
    }
  })
}
