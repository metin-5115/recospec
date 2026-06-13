import * as vscode from 'vscode'
import { loadRc } from '@/cli/config-loader'
import { detectFramework } from '@/cli/detect-framework'
import type { FrameworkId } from '@shared/types/generated'

const FRAMEWORK_LABELS: Record<FrameworkId, string> = {
  'playwright-ts': 'Playwright (TypeScript)',
  cypress: 'Cypress',
  'selenium-py': 'Selenium (Python / Pytest)',
  'selenium-java': 'Selenium (Java / TestNG)',
}

export interface ResolvedWorkspace {
  projectDir: string
  folder: vscode.WorkspaceFolder
}

/**
 * Pick the workspace folder we operate against. Single-folder workspaces
 * resolve silently; multi-root workspaces prompt the user.
 */
export async function resolveWorkspace(): Promise<ResolvedWorkspace | null> {
  const folders = vscode.workspace.workspaceFolders
  if (!folders || folders.length === 0) {
    void vscode.window.showErrorMessage('Recospec: open a folder before running this command.')
    return null
  }
  if (folders.length === 1) {
    const only = folders[0]!
    return { projectDir: only.uri.fsPath, folder: only }
  }
  const folder = await vscode.window.showWorkspaceFolderPick({
    placeHolder: 'Pick the project to apply Recospec to',
  })
  if (!folder) return null
  return { projectDir: folder.uri.fsPath, folder }
}

/**
 * Resolve the active framework for a project directory:
 *   1. `.recospecrc.json` framework pin (if present),
 *   2. marker-file detection (pom.xml / requirements.txt / package.json),
 *   3. fall back to an interactive QuickPick.
 *
 * Returns `null` when the user cancels the picker.
 */
export async function getActiveFramework(projectDir: string): Promise<FrameworkId | null> {
  const rc = loadRc(projectDir)
  if (rc?.config.framework) return rc.config.framework

  const detected = detectFramework(projectDir)
  if (detected) return detected.framework

  const items = (Object.entries(FRAMEWORK_LABELS) as [FrameworkId, string][]).map(
    ([id, label]) => ({ id, label }),
  )
  const choice = await vscode.window.showQuickPick(items, {
    placeHolder: 'No framework detected — pick one for this run',
    ignoreFocusOut: true,
  })
  return choice?.id ?? null
}

export function frameworkLabel(id: FrameworkId): string {
  return FRAMEWORK_LABELS[id]
}
