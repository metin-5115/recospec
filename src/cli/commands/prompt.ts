import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  buildPromptDocument,
  renderPromptMarkdown,
  type PromptMode,
} from '@codegen/export/prompt-export'
import type { JsonExportPayload } from '@codegen/export/json-export'
import type { FrameworkId } from '@shared/types/generated'
import { detectFramework } from '../detect-framework'
import { loadRc } from '../config-loader'
import { resolveConflict } from '../conflict-resolver'

export interface PromptCmdOptions {
  /** Absolute or cwd-relative path to a PlayForge JSON export. */
  json: string
  /** Project root used to resolve default output paths and rc detection. */
  projectDir: string
  /** Output flavour: slash command, CLAUDE.md marker block, or plain prompt file. */
  mode: PromptMode
  /** Flow slug override; otherwise derived from the session name. */
  slug?: string
  /** Framework override; otherwise resolved from rc → detection. Optional. */
  framework?: FrameworkId
  /** Whether to redact sensitive values. Defaults to true. */
  redact?: boolean
  /** Overwrite existing files without prompting. */
  force?: boolean
  /** Print to stdout instead of touching the filesystem. */
  dryRun?: boolean
  /** Explicit output path; bypasses default routing. */
  output?: string
}

type WriteOutcome = 'written' | 'replaced' | 'appended' | 'skipped' | 'renamed' | 'stdout'

const CLAUDE_MD_FILENAME = 'CLAUDE.md'

export async function runPrompt(opts: PromptCmdOptions): Promise<void> {
  const redact = opts.redact ?? true
  if (!redact) {
    // eslint-disable-next-line no-console
    console.warn(
      '⚠️  PLAYFORGE: --no-redact is enabled. Sensitive values (passwords, tokens, ' +
        'secrets) will be written LITERALLY into the output. Treat the result as ' +
        'confidential and rotate any value that may have leaked.',
    )
  }

  const payload = loadJson(opts.json)
  const rc = loadRc(opts.projectDir)
  if (rc) {
    // eslint-disable-next-line no-console
    console.log(`[playforge] using config from ${rc.source}`)
  }
  const framework = resolveFramework(opts, rc?.config.framework)

  const doc = buildPromptDocument(payload, {
    mode: opts.mode,
    framework,
    flowSlug: opts.slug,
    redactSecrets: redact,
  })
  const markdown = renderPromptMarkdown(doc)

  // eslint-disable-next-line no-console
  console.log(
    `[playforge] session=${payload.session.name} mode=${opts.mode} slug=${doc.flowSlug} framework=${framework ?? 'n/a'}`,
  )

  if (opts.dryRun) {
    // eslint-disable-next-line no-console
    console.log(markdown)
    // eslint-disable-next-line no-console
    console.log(`[playforge] dry-run — nothing written.`)
    return
  }

  const outcome = await writePromptOutput(opts, doc.flowSlug, markdown)
  // eslint-disable-next-line no-console
  console.log(`[playforge] done — ${outcome}`)
}

function loadJson(jsonPath: string): JsonExportPayload {
  const abs = resolve(process.cwd(), jsonPath)
  if (!existsSync(abs)) {
    throw new Error(`JSON export not found at ${abs}`)
  }
  const raw = readFileSync(abs, 'utf8')
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

function resolveFramework(
  opts: PromptCmdOptions,
  rcFramework: FrameworkId | undefined,
): FrameworkId | undefined {
  if (opts.framework) return opts.framework
  if (rcFramework) {
    // eslint-disable-next-line no-console
    console.log(`[playforge] framework=${rcFramework} (from .playforgerc.json)`)
    return rcFramework
  }
  const detected = detectFramework(opts.projectDir)
  if (detected) {
    // eslint-disable-next-line no-console
    console.log(`[playforge] auto-detected framework=${detected.framework} via ${detected.source}`)
    return detected.framework
  }
  return undefined
}

function defaultOutputPath(mode: PromptMode, slug: string, projectDir: string): string {
  if (mode === 'slash') {
    return resolve(projectDir, '.claude', 'commands', `playforge-${slug}.md`)
  }
  if (mode === 'prompt') {
    return resolve(projectDir, 'prompts', `${slug}.md`)
  }
  return resolve(projectDir, CLAUDE_MD_FILENAME)
}

async function writePromptOutput(
  opts: PromptCmdOptions,
  slug: string,
  markdown: string,
): Promise<WriteOutcome> {
  const outputPath = opts.output
    ? resolve(process.cwd(), opts.output)
    : defaultOutputPath(opts.mode, slug, opts.projectDir)

  if (opts.mode === 'claude-md') {
    return upsertClaudeMdBlock(outputPath, slug, markdown)
  }

  if (!existsSync(outputPath)) {
    persist(outputPath, markdown)
    // eslint-disable-next-line no-console
    console.log(`[playforge] wrote ${outputPath}`)
    return 'written'
  }

  if (opts.force) {
    persist(outputPath, markdown)
    // eslint-disable-next-line no-console
    console.log(`[playforge] overwrote ${outputPath}`)
    return 'written'
  }

  // Markdown files don't have a structural merge — only overwrite / skip / rename.
  const decision = await resolveConflict({
    targetPath: outputPath,
    incoming: markdown,
    canMerge: false,
  })
  if (decision.action === 'skip') {
    // eslint-disable-next-line no-console
    console.log(`[playforge] skipped ${outputPath}`)
    return 'skipped'
  }
  if (decision.action === 'overwrite') {
    persist(outputPath, markdown)
    // eslint-disable-next-line no-console
    console.log(`[playforge] overwrote ${outputPath}`)
    return 'written'
  }
  if (decision.action === 'rename' && decision.renamedPath) {
    persist(decision.renamedPath, markdown)
    // eslint-disable-next-line no-console
    console.log(`[playforge] wrote ${decision.renamedPath} (renamed to avoid conflict)`)
    return 'renamed'
  }
  return 'skipped'
}

/**
 * Idempotent CLAUDE.md updater: replaces the existing `<!-- BEGIN playforge:<slug> -->`
 * … `<!-- END playforge:<slug> -->` block in place, or appends a fresh block if none
 * exists. We rely on the marker comments already emitted by
 * {@link renderPromptMarkdown} in `claude-md` mode.
 */
function upsertClaudeMdBlock(filePath: string, slug: string, markdown: string): WriteOutcome {
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
  const beginMarker = `<!-- BEGIN playforge:${slug} -->`
  const endMarker = `<!-- END playforge:${slug} -->`

  const beginIdx = existing.indexOf(beginMarker)
  const endIdx = existing.indexOf(endMarker)

  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const before = existing.slice(0, beginIdx)
    const after = existing.slice(endIdx + endMarker.length)
    // `markdown` already starts with the BEGIN marker and ends with END\n, so
    // splice it in unchanged.
    const next = before + markdown.trimEnd() + after
    persist(filePath, next.endsWith('\n') ? next : next + '\n')
    // eslint-disable-next-line no-console
    console.log(`[playforge] replaced block in ${filePath}`)
    return 'replaced'
  }

  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n'
  const next = existing + separator + (existing.length === 0 ? '' : '\n') + markdown
  persist(filePath, next)
  // eslint-disable-next-line no-console
  console.log(`[playforge] appended block to ${filePath}`)
  return 'appended'
}

function persist(diskPath: string, content: string): void {
  mkdirSync(dirname(diskPath), { recursive: true })
  writeFileSync(diskPath, content, 'utf8')
}
