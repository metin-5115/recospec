import * as vscode from 'vscode'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { runAdd } from '@/cli/commands/add'
import { renameForConflict } from '@/cli/conflict-resolver'
import { getAdapter } from '@codegen/adapters/registry'
import { buildPromptDocument, renderPromptMarkdown } from '@codegen/export/prompt-export'
import type { JsonExportPayload } from '@codegen/export/json-export'
import type {
  ConflictContext,
  ConflictDecision,
  ConflictReporter,
} from '@codegen/apply/conflict-reporter'
import type { FrameworkId } from '@shared/types/generated'
import { getActiveFramework, frameworkLabel, resolveWorkspace } from '../workspace-utils'
import { showOutputPicker, type PickerChoices } from '../output-picker'
import type { PlayforgeStatusBar } from '../status-bar'

// Side-effect imports — the adapters self-register in `ADAPTER_REGISTRY`
// when the module is loaded. `runAdd` already pulls these in, but we also
// reach for `getAdapter()` directly when applying picker options, so we
// duplicate the registration imports here to guarantee they run first.
import '@codegen/adapters/playwright-ts'
import '@codegen/adapters/cypress'
import '@codegen/adapters/selenium-py'
import '@codegen/adapters/selenium-java'

/**
 * Wraps `runAdd` so the user can apply a PlayForge JSON export onto the
 * active workspace via a file picker. Framework is resolved silently from
 * `.playforgerc.json` → detection → QuickPick, the Output Picker webview
 * collects the per-run choices, and conflicts surface as VS Code dialogs
 * through a dedicated `ConflictReporter`.
 */
export function registerApplyJsonCommand(
  statusBar: PlayforgeStatusBar,
  output: vscode.OutputChannel,
): vscode.Disposable {
  return vscode.commands.registerCommand('playforge.applyJson', async () => {
    const ws = await resolveWorkspace()
    if (!ws) return

    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'PlayForge JSON': ['json'] },
      openLabel: 'Apply',
      defaultUri: ws.folder.uri,
    })
    if (!picked || picked.length === 0) return

    await applyJsonAtPath({
      jsonPath: picked[0]!.fsPath,
      projectDir: ws.projectDir,
      statusBar,
      output,
    })
  })
}

export interface ApplyJsonAtPathArgs {
  /** Absolute path to a PlayForge JSON export already on disk. */
  jsonPath: string
  /** Workspace directory to apply the rendered files to. */
  projectDir: string
  statusBar: PlayforgeStatusBar
  output: vscode.OutputChannel
}

/**
 * Shared apply pipeline reused by `playforge.applyJson` (file dialog → JSON)
 * and `playforge.record` (Chromium recording → temp JSON → apply). The
 * framework is resolved via the standard rc → detection → QuickPick chain,
 * and the Output Picker collects per-run choices.
 */
export async function applyJsonAtPath(args: ApplyJsonAtPathArgs): Promise<void> {
  const framework = await getActiveFramework(args.projectDir)
  if (!framework) return

  let payload: JsonExportPayload
  try {
    payload = loadJsonPayload(args.jsonPath)
  } catch (err) {
    void vscode.window.showErrorMessage(`PlayForge: cannot read JSON — ${(err as Error).message}`)
    return
  }

  const meta = buildPickerMeta(args.jsonPath, payload, framework)
  const choices = await showOutputPicker(meta)
  if (!choices) return

  args.output.show(true)
  args.output.appendLine('')
  args.output.appendLine(`[playforge] applying ${args.jsonPath}`)
  args.output.appendLine(`[playforge] framework=${framework}`)
  args.output.appendLine(`[playforge] target=${args.projectDir}`)
  args.output.appendLine(`[playforge] choices=${formatChoices(choices)}`)

  const reporter = createWebviewReporter(args.output)
  args.statusBar.setBusy('apply')
  const restoreConsole = pipeConsoleToOutput(args.output)
  try {
    if (choices.testCode) {
      // Adapters consume render-time flags via `applyOptions` before
      // `runAdd` calls `renderPageObject` / `renderScenario`.
      getAdapter(framework).applyOptions?.({
        includeMocks: choices.mocks,
        bdd: choices.bdd,
      })
      await runAdd(
        {
          json: args.jsonPath,
          projectDir: args.projectDir,
          framework,
          bdd: choices.bdd,
        },
        reporter,
      )
    } else {
      args.output.appendLine('[playforge] test code generation skipped (picker)')
    }

    if (choices.claudePrompt) {
      await renderAndWritePrompt({
        payload,
        framework,
        projectDir: args.projectDir,
        mode: choices.promptMode,
        redact: choices.redact,
        reporter,
        output: args.output,
      })
    } else {
      args.output.appendLine('[playforge] Claude prompt skipped (picker)')
    }

    void vscode.window.showInformationMessage('PlayForge: apply complete.')
  } catch (err) {
    const message = (err as Error).message
    args.output.appendLine(`[playforge] ERROR: ${message}`)
    void vscode.window.showErrorMessage(`PlayForge apply failed: ${message}`)
  } finally {
    restoreConsole()
    args.statusBar.setIdle()
  }
}

function loadJsonPayload(jsonPath: string): JsonExportPayload {
  const raw = readFileSync(jsonPath, 'utf8')
  const payload = JSON.parse(raw) as JsonExportPayload
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

function buildPickerMeta(jsonPath: string, payload: JsonExportPayload, framework: FrameworkId) {
  const hasNetworkSteps = payload.actions.some((a) => a.type === 'network')
  return {
    jsonPath,
    sessionName: payload.session.name,
    framework,
    frameworkLabel: frameworkLabel(framework),
    stepCount: payload.actions.length,
    hasNetworkSteps,
    // All four adapters implement BDD today; if a future adapter drops support
    // the runAdd path also surfaces an explicit error.
    supportsBdd: true,
  }
}

function formatChoices(c: PickerChoices): string {
  const flags: string[] = []
  if (c.testCode) flags.push(`testCode${c.bdd ? '+bdd' : ''}${c.mocks ? '+mocks' : ''}`)
  if (c.claudePrompt) flags.push(`prompt(${c.promptMode}${c.redact ? '' : ',no-redact'})`)
  return flags.length > 0 ? flags.join(' ') : 'none'
}

interface PromptWriteArgs {
  payload: JsonExportPayload
  framework: FrameworkId
  projectDir: string
  mode: PickerChoices['promptMode']
  redact: boolean
  reporter: ConflictReporter
  output: vscode.OutputChannel
}

/**
 * Render the Claude prompt and persist it. Mirrors the routing in
 * `runPrompt` (slash → `.claude/commands/...`, prompt → `prompts/...`,
 * claude-md → in-place CLAUDE.md block) but uses the shared
 * `ConflictReporter` so the user gets the same merge / overwrite / .new UX
 * as the test-code path.
 */
async function renderAndWritePrompt(args: PromptWriteArgs): Promise<void> {
  const doc = buildPromptDocument(args.payload, {
    mode: args.mode,
    framework: args.framework,
    redactSecrets: args.redact,
  })
  const markdown = renderPromptMarkdown(doc)
  const targetPath = defaultPromptPath(args.mode, doc.flowSlug, args.projectDir)

  args.output.appendLine(
    `[playforge] prompt: slug=${doc.flowSlug} mode=${args.mode} → ${targetPath}`,
  )

  if (args.mode === 'claude-md') {
    upsertClaudeMdBlock(targetPath, doc.flowSlug, markdown)
    args.output.appendLine(`[playforge] wrote ${targetPath}`)
    return
  }

  if (!existsSync(targetPath)) {
    persist(targetPath, markdown)
    args.output.appendLine(`[playforge] wrote ${targetPath}`)
    return
  }

  const decision = await args.reporter.resolve({
    targetPath,
    incoming: markdown,
    canMerge: false,
  })
  if (decision.action === 'skip') {
    args.output.appendLine(`[playforge] skipped ${targetPath}`)
    return
  }
  if (decision.action === 'overwrite') {
    persist(targetPath, markdown)
    args.output.appendLine(`[playforge] overwrote ${targetPath}`)
    return
  }
  if (decision.action === 'rename' && decision.renamedPath) {
    persist(decision.renamedPath, markdown)
    args.output.appendLine(`[playforge] wrote ${decision.renamedPath}`)
    return
  }
  args.output.appendLine(`[playforge] skipped ${targetPath} (no terminal choice)`)
}

function defaultPromptPath(
  mode: PickerChoices['promptMode'],
  slug: string,
  projectDir: string,
): string {
  if (mode === 'slash') {
    return resolvePath(projectDir, '.claude', 'commands', `playforge-${slug}.md`)
  }
  if (mode === 'prompt') {
    return resolvePath(projectDir, 'prompts', `${slug}.md`)
  }
  return resolvePath(projectDir, 'CLAUDE.md')
}

/**
 * Idempotent CLAUDE.md updater — mirrors `runPrompt`'s upserter so the VS
 * Code flow and the CLI flow leave identical bytes on disk for the same
 * inputs. Replaces an existing `BEGIN/END playforge:<slug>` block in place,
 * otherwise appends a fresh block.
 */
function upsertClaudeMdBlock(filePath: string, slug: string, markdown: string): void {
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
  const beginMarker = `<!-- BEGIN playforge:${slug} -->`
  const endMarker = `<!-- END playforge:${slug} -->`
  const beginIdx = existing.indexOf(beginMarker)
  const endIdx = existing.indexOf(endMarker)

  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const before = existing.slice(0, beginIdx)
    const after = existing.slice(endIdx + endMarker.length)
    const next = before + markdown.trimEnd() + after
    persist(filePath, next.endsWith('\n') ? next : next + '\n')
    return
  }
  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n'
  const next = existing + separator + (existing.length === 0 ? '' : '\n') + markdown
  persist(filePath, next)
}

function persist(diskPath: string, content: string): void {
  mkdirSync(dirname(diskPath), { recursive: true })
  writeFileSync(diskPath, content, 'utf8')
}

/**
 * `runAdd` logs progress with `console.log`/`console.warn`. Redirect both to
 * the PlayForge output channel for the duration of the command so the user
 * sees a coherent transcript without digging through the extension-host
 * console.
 */
function pipeConsoleToOutput(output: vscode.OutputChannel): () => void {
  /* eslint-disable no-console */
  const origLog = console.log
  const origWarn = console.warn
  const origError = console.error
  const format = (args: unknown[]): string =>
    args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')

  console.log = (...args: unknown[]) => output.appendLine(format(args))
  console.warn = (...args: unknown[]) => output.appendLine(`[warn] ${format(args)}`)
  console.error = (...args: unknown[]) => output.appendLine(`[error] ${format(args)}`)
  return () => {
    console.log = origLog
    console.warn = origWarn
    console.error = origError
  }
  /* eslint-enable no-console */
}

/**
 * QuickPick-based conflict reporter. The Output Picker covers per-run
 * choices; per-file conflicts stay as a QuickPick because they happen mid-
 * apply and a second webview would steal focus from the running operation.
 */
function createWebviewReporter(output: vscode.OutputChannel): ConflictReporter {
  return {
    async resolve(ctx: ConflictContext): Promise<ConflictDecision> {
      const options: {
        label: string
        description?: string
        action: ConflictDecision['action']
      }[] = []
      if (ctx.canMerge) {
        options.push({
          label: '$(git-merge) Merge',
          description: 'append new methods/getters into the existing file',
          action: 'merge',
        })
      }
      options.push(
        {
          label: '$(replace-all) Overwrite',
          description: 'replace the existing file',
          action: 'overwrite',
        },
        {
          label: '$(circle-slash) Skip',
          description: 'keep the existing file untouched',
          action: 'skip',
        },
        {
          label: '$(new-file) Write .new',
          description: 'write the new file alongside the existing one',
          action: 'rename',
        },
        {
          label: '$(diff) Show diff',
          description: 'open a diff editor and re-prompt',
          action: 'diff',
        },
      )

      for (;;) {
        const choice = await vscode.window.showQuickPick(options, {
          placeHolder: `PlayForge conflict: ${ctx.targetPath}`,
          ignoreFocusOut: true,
        })
        if (!choice) {
          output.appendLine(`[playforge] no choice — skipping ${ctx.targetPath}`)
          return { action: 'skip' }
        }
        if (choice.action === 'diff') {
          await showDiff(ctx)
          continue
        }
        if (choice.action === 'rename') {
          return {
            action: 'rename',
            renamedPath: renameForConflict(ctx.targetPath),
          }
        }
        return { action: choice.action }
      }
    },
  }
}

async function showDiff(ctx: ConflictContext): Promise<void> {
  const left = vscode.Uri.file(ctx.targetPath)
  // Use an untitled URI for the incoming side so the diff is read-only-feeling
  // and we don't risk persisting the buffer accidentally.
  const right = vscode.Uri.parse(`untitled:${ctx.targetPath}.incoming?playforge-incoming`)

  const doc = await vscode.workspace.openTextDocument(right)
  const edit = new vscode.WorkspaceEdit()
  edit.insert(right, new vscode.Position(0, 0), ctx.incoming)
  await vscode.workspace.applyEdit(edit)
  await vscode.commands.executeCommand(
    'vscode.diff',
    left,
    doc.uri,
    `PlayForge: ${ctx.targetPath} ↔ incoming`,
    { preview: true },
  )
}
