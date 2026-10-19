import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { buildLlmContext } from '@codegen/export/llm-context'
import {
  estimateTokens,
  renderLlmContextCompact,
  renderLlmContextJson,
} from '@codegen/export/llm-context-render'
import type { FrameworkId, LlmContextFormat, LlmContextTask } from '@shared/types/generated'
import { loadRc } from '../config-loader'
import { resolveConflict } from '../conflict-resolver'
import { loadJson, resolveFramework } from './prompt'

export interface ContextCmdOptions {
  /** Absolute or cwd-relative path to a Recospec JSON export. */
  json: string
  projectDir: string
  format: LlmContextFormat
  task: LlmContextTask
  slug?: string
  framework?: FrameworkId
  /** Whether to redact sensitive values. Defaults to true. */
  redact?: boolean
  /** Drop rules and the task line, leaving only the recorded data. */
  noInstructions?: boolean
  force?: boolean
  /** Print the context to stdout instead of touching the filesystem. */
  dryRun?: boolean
  output?: string
}

const CONTEXT_DIR = ['.recospec', 'context'] as const
const FILE_EXTENSIONS: Record<LlmContextFormat, string> = { compact: 'llm.txt', json: 'llm.json' }

/**
 * Status lines go to stderr so `--dry-run` stdout stays a clean document that
 * can be piped straight into a local model.
 */
function status(message: string): void {
  console.error(`[recospec] ${message}`)
}

export async function runContext(opts: ContextCmdOptions): Promise<void> {
  const redact = opts.redact ?? true
  if (!redact) {
    status(
      '⚠️  --no-redact is enabled. Sensitive values will be written LITERALLY into the output. ' +
        'Treat the result as confidential.',
    )
  }

  const payload = loadJson(opts.json)
  const rc = loadRc(opts.projectDir)
  if (rc) status(`using config from ${rc.source}`)
  const framework = resolveFramework(opts, rc?.config.framework)

  const ctx = buildLlmContext(payload, {
    task: opts.task,
    framework,
    flowSlug: opts.slug,
    redactSecrets: redact,
    includeInstructions: !opts.noInstructions,
  })
  const text = opts.format === 'json' ? renderLlmContextJson(ctx) : renderLlmContextCompact(ctx)
  status(
    `session=${payload.session.name} format=${opts.format} task=${opts.task} ` +
      `framework=${framework ?? 'n/a'} ~${estimateTokens(text)} tokens`,
  )

  if (opts.dryRun) {
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
    status('dry-run — nothing written.')
    return
  }

  const outputPath = opts.output
    ? resolve(process.cwd(), opts.output)
    : resolve(opts.projectDir, ...CONTEXT_DIR, `${ctx.flow}.${FILE_EXTENSIONS[opts.format]}`)
  await writeContext(outputPath, text, Boolean(opts.force))
}

async function writeContext(outputPath: string, text: string, force: boolean): Promise<void> {
  if (existsSync(outputPath) && !force) {
    const decision = await resolveConflict({
      targetPath: outputPath,
      incoming: text,
      canMerge: false,
    })
    if (decision.action === 'skip') {
      status(`skipped ${outputPath}`)
      return
    }
    if (decision.action === 'rename' && decision.renamedPath) {
      persist(decision.renamedPath, text)
      status(`wrote ${decision.renamedPath} (renamed to avoid conflict)`)
      return
    }
  }
  persist(outputPath, text)
  status(`wrote ${outputPath}`)
}

function persist(diskPath: string, content: string): void {
  mkdirSync(dirname(diskPath), { recursive: true })
  writeFileSync(diskPath, content, 'utf8')
}
