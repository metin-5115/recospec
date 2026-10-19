import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { FrameworkId, GeneratedFile, OutputSelection } from '@shared/types/generated'
import { normalizeSelection } from '@shared/types/generated'
import { generateFromActions } from '@codegen/index'
import type { JsonExportPayload } from '@codegen/export/json-export'
import type { GenerateOptions } from '@shared/types/generate-options'
import { resolveOutputPath } from '@codegen/export/output-path'
import type { OutputDirOverrides } from '@shared/types/generate-options'
import type { ConflictReporter } from '@codegen/apply/conflict-reporter'
import { detectFramework } from '../detect-framework'
import { loadRc } from '../config-loader'
import { createTerminalReporter } from '../conflict-resolver'
import { mergeTsPageObject } from '../merge/ts-page-object'
import { mergePyPageObject } from '../merge/py-page-object'
import { mergeJavaPageObject } from '../merge/java-page-object'
import { mergeFeatureFile } from '../merge/feature-file'

/** The generation options `add` passes through unchanged; everything else is about the files it writes. */
type PassThroughOptions = Pick<
  GenerateOptions,
  | 'includeMocks'
  | 'selfHealing'
  | 'finalStateAssertion'
  | 'autoWaitEnabled'
  | 'methodRenames'
  | 'testData'
  | 'templateModes'
  | 'composedModes'
>

export interface AddOptions extends PassThroughOptions {
  /** Absolute or cwd-relative path to a Recospec JSON export. */
  json: string
  /** Project root where the page-object / spec files will be written. */
  projectDir: string
  /** Explicit override for framework detection. */
  framework?: FrameworkId
  /** Skip prompts and overwrite every existing file. Useful for CI. */
  force?: boolean
  /** Skip prompts and keep every existing file. */
  dryRun?: boolean
  /** Emit Gherkin .feature + step definitions instead of a vanilla spec. */
  bdd?: boolean
  /**
   * Which file groups to write. `scaffold` is always ignored here — the CLI
   * assumes an existing, configured project. Defaults to page objects + test.
   */
  selection?: Partial<Pick<OutputSelection, 'pageObjects' | 'test'>>
}

interface ResolvedTarget {
  /** Full disk path where the file should be written. */
  diskPath: string
  /** Original filename emitted by the adapter (e.g. `LoginPage.ts`). */
  filename: string
  /** File content from the adapter. */
  content: string
}

type MergeKind = 'ts-page' | 'py-page' | 'java-page' | 'feature' | null

export async function runAdd(opts: AddOptions, reporter?: ConflictReporter): Promise<void> {
  // Default to the terminal (prompts-based) reporter when no host injects
  // its own — this is the only call site that builds it, so non-CLI hosts
  // never pay the `prompts` import cost.
  const activeReporter = reporter ?? createTerminalReporter()

  const payload = loadJson(opts.json)
  const rc = loadRc(opts.projectDir)
  if (rc) {
    // eslint-disable-next-line no-console
    console.log(`[recospec] using config from ${rc.source}`)
  }
  const framework = resolveFramework(opts, rc?.config.framework)
  const bdd = opts.bdd ?? rc?.config.bdd ?? false
  // The CLI never writes scaffold (it targets an existing project). Honour the
  // page-objects / test toggles, defaulting both on.
  const selection = normalizeSelection({ ...opts.selection, scaffold: false })
  if (!selection.pageObjects && !selection.test) {
    // eslint-disable-next-line no-console
    console.log('[recospec] nothing to write — enable page objects and/or the test spec.')
    return
  }

  // eslint-disable-next-line no-console
  console.log(
    `[recospec] session=${payload.session.name} framework=${framework} bdd=${bdd} target=${opts.projectDir}`,
  )

  const code = generateFromActions(payload.session, payload.actions, framework, {
    includeMocks: opts.includeMocks,
    selfHealing: opts.selfHealing,
    finalStateAssertion: opts.finalStateAssertion,
    autoWaitEnabled: opts.autoWaitEnabled,
    methodRenames: opts.methodRenames,
    testData: opts.testData,
    bdd,
    selection,
    templateModes: opts.templateModes,
    composedModes: opts.composedModes,
    dirs: rc?.config.paths,
  })
  const emitted: GeneratedFile[] = code.files

  // Per spec: SKIP scaffold. The CLI assumes the user's project already has
  // a configured test runner.
  const targets = emitted.map((f) => routeToDisk(f, framework, opts.projectDir, rc?.config.paths))

  let written = 0
  let merged = 0
  let skipped = 0
  let renamed = 0

  for (const target of targets) {
    const outcome = await writeOne(target, opts, framework, activeReporter)
    if (outcome === 'written') written++
    else if (outcome === 'merged') merged++
    else if (outcome === 'skipped') skipped++
    else if (outcome === 'renamed') renamed++
  }

  // eslint-disable-next-line no-console
  console.log(
    `[recospec] done — written=${written} merged=${merged} renamed=${renamed} skipped=${skipped}`,
  )
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

function resolveFramework(opts: AddOptions, rcFramework: FrameworkId | undefined): FrameworkId {
  if (opts.framework) return opts.framework
  if (rcFramework) {
    // eslint-disable-next-line no-console
    console.log(`[recospec] framework=${rcFramework} (from .recospecrc.json)`)
    return rcFramework
  }
  const detected = detectFramework(opts.projectDir)
  if (!detected) {
    throw new Error(
      `Could not auto-detect a framework in ${opts.projectDir}. Pass --framework playwright-ts|cypress|selenium-py|selenium-java or run \`recospec init\` first.`,
    )
  }
  // eslint-disable-next-line no-console
  console.log(`[recospec] auto-detected framework=${detected.framework} via ${detected.source}`)
  return detected.framework
}

/**
 * Map an adapter-emitted filename to a disk path under the target project.
 * Uses the same layout table as the ZIP export, anchored at `projectDir`, with any folders the
 * project's `.recospecrc.json` `paths` setting relocates.
 */
function routeToDisk(
  file: GeneratedFile,
  framework: FrameworkId,
  projectDir: string,
  dirs: OutputDirOverrides | undefined,
): ResolvedTarget {
  const relative = resolveOutputPath(file.filename, framework, dirs)
  return {
    diskPath: resolve(projectDir, relative),
    filename: file.filename,
    content: file.content,
  }
}

type WriteOutcome = 'written' | 'merged' | 'skipped' | 'renamed'

function mergeKindFor(target: ResolvedTarget, framework: FrameworkId): MergeKind {
  if (target.filename.endsWith('.feature')) return 'feature'
  if (framework === 'playwright-ts' && /Page\.tsx?$/.test(target.filename)) return 'ts-page'
  if (framework === 'cypress' && /Page\.js$/.test(target.filename)) return null // JS class merge not supported yet — overwrite/skip only
  if (
    framework === 'selenium-py' &&
    /\.py$/.test(target.filename) &&
    !target.filename.startsWith('test_')
  )
    return 'py-page'
  if (framework === 'selenium-java' && /Page\.java$/.test(target.filename)) return 'java-page'
  return null
}

async function writeOne(
  target: ResolvedTarget,
  opts: AddOptions,
  framework: FrameworkId,
  reporter: ConflictReporter,
): Promise<WriteOutcome> {
  if (!existsSync(target.diskPath)) {
    if (opts.dryRun) {
      // eslint-disable-next-line no-console
      console.log(`[recospec] would write (dry-run): ${target.diskPath}`)
      return 'skipped'
    }
    persist(target.diskPath, target.content)
    return 'written'
  }

  // Existing file — resolve the conflict.
  if (opts.dryRun) {
    // eslint-disable-next-line no-console
    console.log(`[recospec] skip (dry-run): ${target.diskPath}`)
    return 'skipped'
  }
  if (opts.force) {
    persist(target.diskPath, target.content)
    return 'written'
  }

  const kind = mergeKindFor(target, framework)
  const decision = await reporter.resolve({
    targetPath: target.diskPath,
    incoming: target.content,
    canMerge: kind !== null,
  })

  if (decision.action === 'skip') {
    // eslint-disable-next-line no-console
    console.log(`[recospec] skipped ${target.diskPath}`)
    return 'skipped'
  }
  if (decision.action === 'overwrite') {
    persist(target.diskPath, target.content)
    return 'written'
  }
  if (decision.action === 'rename' && decision.renamedPath) {
    persist(decision.renamedPath, target.content)
    // eslint-disable-next-line no-console
    console.log(`[recospec] wrote ${decision.renamedPath} (renamed to avoid conflict)`)
    return 'renamed'
  }
  if (decision.action === 'merge') {
    const existing = readFileSync(target.diskPath, 'utf8')
    try {
      const result = await runMerge(kind, existing, target.content)
      if (result.outcome === 'skipped') {
        // eslint-disable-next-line no-console
        console.log(`[recospec] skipped ${target.diskPath} (merge fallback)`)
        return 'skipped'
      }
      persist(target.diskPath, result.source)
      // eslint-disable-next-line no-console
      console.log(
        `[recospec] merged ${target.diskPath} — added=[${result.added.join(', ')}] skipped=[${result.skipped.join(
          ', ',
        )}]`,
      )
      return 'merged'
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[recospec] merge failed for ${target.diskPath}: ${(err as Error).message}. Falling back to .new file.`,
      )
      const fallback = decision.renamedPath ?? renameFallback(target.diskPath)
      persist(fallback, target.content)
      return 'renamed'
    }
  }

  return 'skipped'
}

interface MergeOutcome {
  source: string
  added: string[]
  skipped: string[]
  outcome?: 'skipped'
}

async function runMerge(
  kind: MergeKind,
  existing: string,
  incoming: string,
): Promise<MergeOutcome> {
  if (kind === 'ts-page') {
    const r = mergeTsPageObject(existing, incoming)
    return { source: r.source, added: r.added, skipped: r.skipped }
  }
  if (kind === 'py-page') {
    const r = mergePyPageObject(existing, incoming)
    return { source: r.source, added: r.added, skipped: r.skipped }
  }
  if (kind === 'java-page') {
    const r = await mergeJavaPageObject(existing, incoming)
    if (r.fallback === 'nested-class-skip') {
      return { source: existing, added: [], skipped: [], outcome: 'skipped' }
    }
    return { source: r.source, added: r.added, skipped: r.skipped }
  }
  if (kind === 'feature') {
    const r = mergeFeatureFile(existing, incoming)
    return { source: r.source, added: r.added, skipped: r.skipped }
  }
  throw new Error('runMerge: unsupported merge kind')
}

function persist(diskPath: string, content: string): void {
  mkdirSync(dirname(diskPath), { recursive: true })
  writeFileSync(diskPath, content, 'utf8')
}

function renameFallback(diskPath: string): string {
  const idx = diskPath.lastIndexOf('.')
  if (idx === -1) return `${diskPath}.new`
  return `${diskPath.slice(0, idx)}.new${diskPath.slice(idx)}`
}
