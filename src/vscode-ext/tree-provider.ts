import * as vscode from 'vscode'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { JsonExportPayload } from '@codegen/export/json-export'

export const SESSIONS_DIR = '.playforge/sessions'

/**
 * Resolve the audit sessions directory for a workspace folder. The Record
 * command writes each capture into this folder so the tree provider can
 * list them later. The path is always relative to the workspace root so a
 * multi-root workspace can host a separate history per project.
 */
export function getSessionsDir(workspaceRoot: string): string {
  return join(workspaceRoot, SESSIONS_DIR)
}

export interface RecordingItemMeta {
  /** Display name pulled from the JSON `session.name` field. */
  name: string
  /** Absolute path to the JSON file. */
  fullPath: string
  /** Filesystem mtime — used to sort newest-first. */
  mtimeMs: number
  /** Number of recorded actions; surfaced in the description. */
  stepCount: number
}

/**
 * Read a single JSON export and project it to the lightweight shape the
 * tree provider needs. Bad files (parse errors, schema mismatches) are
 * skipped silently — the provider must never throw because one stale file
 * breaks the whole view.
 */
function readRecording(fullPath: string): RecordingItemMeta | null {
  try {
    const stat = statSync(fullPath)
    const raw = readFileSync(fullPath, 'utf8')
    const payload = JSON.parse(raw) as JsonExportPayload
    if (payload.formatVersion !== 1 || !payload.session) return null
    return {
      name: payload.session.name || '(unnamed session)',
      fullPath,
      mtimeMs: stat.mtimeMs,
      stepCount: Array.isArray(payload.actions) ? payload.actions.length : 0,
    }
  } catch {
    return null
  }
}

export class RecordingTreeItem extends vscode.TreeItem {
  constructor(public readonly meta: RecordingItemMeta) {
    super(meta.name, vscode.TreeItemCollapsibleState.None)
    const date = new Date(meta.mtimeMs).toLocaleString()
    this.description = `${meta.stepCount} steps · ${date}`
    this.tooltip = `${meta.name}\n${meta.fullPath}`
    this.iconPath = new vscode.ThemeIcon('play-circle')
    this.contextValue = 'playforgeRecording'
    this.resourceUri = vscode.Uri.file(meta.fullPath)
    this.command = {
      command: 'playforge.recordings.apply',
      title: 'Apply Recording',
      arguments: [this],
    }
  }
}

/**
 * Lists `.playforge/sessions/*.json` for the active single-folder workspace.
 *
 * Multi-root workspaces are out of scope for v0.7 — we show the first folder
 * only, with a welcome view that asks the user to open a single project. The
 * scope is deliberate so the rest of the extension (apply, record) keeps a
 * single project context.
 */
export class RecordingsTreeProvider implements vscode.TreeDataProvider<RecordingTreeItem> {
  private readonly _onDidChange = new vscode.EventEmitter<RecordingTreeItem | undefined | void>()
  readonly onDidChangeTreeData = this._onDidChange.event

  refresh(): void {
    this._onDidChange.fire()
  }

  getTreeItem(element: RecordingTreeItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: RecordingTreeItem): RecordingTreeItem[] {
    // Flat list — no nesting today.
    if (element) return []

    const folder = vscode.workspace.workspaceFolders?.[0]
    if (!folder) return []

    const dir = getSessionsDir(folder.uri.fsPath)
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      // Directory doesn't exist yet — first Record will create it.
      return []
    }

    const recordings: RecordingItemMeta[] = []
    for (const name of entries) {
      if (!name.endsWith('.json')) continue
      const meta = readRecording(join(dir, name))
      if (meta) recordings.push(meta)
    }
    recordings.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return recordings.map((m) => new RecordingTreeItem(m))
  }
}

/**
 * Watch the sessions directory and re-emit `onDidChangeTreeData` whenever a
 * file lands or disappears. We use a VS Code workspace file watcher rather
 * than `fs.watch` so the host handles cross-platform quirks (Windows file
 * locks, atomic rename on save, etc.).
 */
export function createSessionsWatcher(provider: RecordingsTreeProvider): vscode.Disposable {
  const pattern = new vscode.RelativePattern(
    vscode.workspace.workspaceFolders?.[0] ?? vscode.Uri.file(''),
    `${SESSIONS_DIR}/*.json`,
  )
  const watcher = vscode.workspace.createFileSystemWatcher(pattern)
  const refresh = () => provider.refresh()
  watcher.onDidCreate(refresh)
  watcher.onDidChange(refresh)
  watcher.onDidDelete(refresh)
  return watcher
}
