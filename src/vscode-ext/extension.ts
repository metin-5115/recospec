import * as vscode from 'vscode'
import { unlink } from 'node:fs/promises'
import { registerInitCommand } from './commands/init'
import { registerApplyJsonCommand, applyJsonAtPath } from './commands/apply-json'
import { registerShowPromptCommand } from './commands/show-prompt'
import { registerRecordCommand } from './commands/record'
import { createStatusBar } from './status-bar'
import { detectFramework } from '@/cli/detect-framework'
import { loadRc } from '@/cli/config-loader'
import { frameworkLabel, resolveWorkspace } from './workspace-utils'
import { RecordingTreeItem, RecordingsTreeProvider, createSessionsWatcher } from './tree-provider'
import type { FrameworkId } from '@shared/types/generated'

/**
 * Activation entry. Wires every command + the Recordings tree view and a
 * status-bar indicator, then probes the active workspace so the status bar
 * shows the resolved framework before the user runs anything.
 */
export function activate(context: vscode.ExtensionContext): void {
  const statusBar = createStatusBar()
  const output = vscode.window.createOutputChannel('PlayForge')

  const treeProvider = new RecordingsTreeProvider()
  const treeView = vscode.window.createTreeView('playforge.recordings', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  })

  context.subscriptions.push(
    statusBar,
    output,
    treeView,
    createSessionsWatcher(treeProvider),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshStatusBarFramework(statusBar)
      treeProvider.refresh()
    }),
    registerInitCommand(statusBar),
    registerApplyJsonCommand(statusBar, output),
    registerShowPromptCommand(statusBar, output),
    registerRecordCommand(statusBar, output, context),
    vscode.commands.registerCommand('playforge.recordings.refresh', () => treeProvider.refresh()),
    vscode.commands.registerCommand(
      'playforge.recordings.apply',
      async (item?: RecordingTreeItem) => {
        if (!item) return
        const ws = await resolveWorkspace()
        if (!ws) return
        await applyJsonAtPath({
          jsonPath: item.meta.fullPath,
          projectDir: ws.projectDir,
          statusBar,
          output,
        })
      },
    ),
    vscode.commands.registerCommand(
      'playforge.recordings.reveal',
      async (item?: RecordingTreeItem) => {
        if (!item) return
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(item.meta.fullPath))
      },
    ),
    vscode.commands.registerCommand(
      'playforge.recordings.delete',
      async (item?: RecordingTreeItem) => {
        if (!item) return
        const pick = await vscode.window.showWarningMessage(
          `Delete recording "${item.meta.name}"? The JSON file will be removed from .playforge/sessions/.`,
          { modal: true },
          'Delete',
        )
        if (pick !== 'Delete') return
        try {
          await unlink(item.meta.fullPath)
          treeProvider.refresh()
        } catch (err) {
          void vscode.window.showErrorMessage(
            `PlayForge: failed to delete recording — ${(err as Error).message}`,
          )
        }
      },
    ),
  )

  refreshStatusBarFramework(statusBar)
}

export function deactivate(): void {
  // No-op — every disposable is registered on `context.subscriptions`.
}

function refreshStatusBarFramework(statusBar: {
  setFramework: (label: string | null) => void
}): void {
  const folders = vscode.workspace.workspaceFolders
  if (!folders || folders.length !== 1) {
    statusBar.setFramework(null)
    return
  }
  const projectDir = folders[0]!.uri.fsPath
  const rc = loadRc(projectDir)
  let framework: FrameworkId | undefined = rc?.config.framework
  if (!framework) {
    framework = detectFramework(projectDir)?.framework
  }
  statusBar.setFramework(framework ? frameworkLabel(framework) : null)
}
