import * as vscode from 'vscode'
import { readFileSync } from 'node:fs'
import {
  buildPromptDocument,
  renderPromptMarkdown,
  type PromptMode,
} from '@codegen/export/prompt-export'
import type { JsonExportPayload } from '@codegen/export/json-export'
import { getActiveFramework, resolveWorkspace } from '../workspace-utils'
import type { PlayforgeStatusBar } from '../status-bar'

const MODES: { label: string; description: string; mode: PromptMode }[] = [
  {
    label: 'Slash command',
    description: '.claude/commands/playforge-<slug>.md',
    mode: 'slash',
  },
  {
    label: 'CLAUDE.md marker block',
    description: 'BEGIN/END playforge:<slug> block in CLAUDE.md',
    mode: 'claude-md',
  },
  {
    label: 'Plain prompt',
    description: 'prompts/<slug>.md',
    mode: 'prompt',
  },
]

/**
 * Renders a PlayForge JSON export into a Claude Code prompt and previews it
 * in a new untitled editor. We deliberately do not write to disk in Sprint
 * 4 — the preview keeps the user in control while the Output Picker webview
 * (Sprint 5) takes over the persistence concerns.
 */
export function registerShowPromptCommand(
  statusBar: PlayforgeStatusBar,
  output: vscode.OutputChannel,
): vscode.Disposable {
  return vscode.commands.registerCommand('playforge.showPrompt', async () => {
    const ws = await resolveWorkspace()
    if (!ws) return

    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'PlayForge JSON': ['json'] },
      openLabel: 'Render',
      defaultUri: ws.folder.uri,
    })
    if (!picked || picked.length === 0) return

    const modeChoice = await vscode.window.showQuickPick(MODES, {
      placeHolder: 'Pick prompt output mode',
      ignoreFocusOut: true,
    })
    if (!modeChoice) return

    statusBar.setBusy('prompt')
    try {
      const jsonPath = picked[0]!.fsPath
      const payload = loadJson(jsonPath)
      const framework = (await getActiveFramework(ws.projectDir)) ?? undefined

      const doc = buildPromptDocument(payload, {
        mode: modeChoice.mode,
        framework,
        redactSecrets: true,
      })
      const markdown = renderPromptMarkdown(doc)

      output.appendLine('')
      output.appendLine(
        `[playforge] rendered prompt — session=${payload.session.name} mode=${modeChoice.mode} slug=${doc.flowSlug} framework=${framework ?? 'n/a'}`,
      )

      const document = await vscode.workspace.openTextDocument({
        content: markdown,
        language: 'markdown',
      })
      await vscode.window.showTextDocument(document, { preview: false })
    } catch (err) {
      const message = (err as Error).message
      output.appendLine(`[playforge] ERROR: ${message}`)
      void vscode.window.showErrorMessage(`PlayForge prompt render failed: ${message}`)
    } finally {
      statusBar.setIdle()
    }
  })
}

function loadJson(jsonPath: string): JsonExportPayload {
  const payload = JSON.parse(readFileSync(jsonPath, 'utf8')) as JsonExportPayload
  if (payload.formatVersion !== 1) {
    throw new Error(
      `Unsupported JSON formatVersion: ${payload.formatVersion}. Re-export from the extension.`,
    )
  }
  if (!payload.session || !Array.isArray(payload.actions)) {
    throw new Error('Malformed JSON export — missing `session` or `actions`.')
  }
  return payload
}
