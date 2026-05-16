import { getActionsBySession } from '@storage/action-repo'
import { getSession } from '@storage/session-repo'
import { normalizeActions } from './normalizer/action-normalizer'
import { groupIntoPages } from './planner/page-grouper'
import './adapters/playwright-ts'
import './adapters/cypress'
import './adapters/selenium-py'
import './adapters/selenium-java'
import { getAdapter } from './adapters/registry'
import type { FrameworkId, GeneratedCode } from '@shared/types/generated'
import type { IRDocument, IRScenario, TestDataConfig } from './ir/types'

export interface GenerateOptions {
  /** Emit `page.route(...)` mocks for any captured network actions. */
  includeMocks?: boolean
  /** Map of `${pageClassName}.${inferredName}` → user-chosen name. */
  methodRenames?: Record<string, string>
  /**
   * When `false`, auto-detected `wait` steps are stripped from the IR before
   * code generation. Defaults to `true`.
   */
  autoWaitEnabled?: boolean
  /**
   * User-edited test data config — drives env-var emission for sensitive
   * fields and which fixture/.env scaffolds adapters render.
   */
  testData?: TestDataConfig
  /** Emit Gherkin `.feature` + step definitions alongside the page objects. */
  bdd?: boolean
}

function applyRenames(
  pages: ReturnType<typeof groupIntoPages>,
  renames: Record<string, string>,
): void {
  for (const page of pages) {
    if (!page.inferredMethods?.length) continue
    page.inferredMethods = page.inferredMethods.map((m) => {
      const key = `${page.className}.${m.name}`
      const next = renames[key]
      return next && next.trim() ? { ...m, name: next.trim() } : m
    })
  }
}

export async function generate(
  sessionId: string,
  framework: FrameworkId,
  options: GenerateOptions = {},
): Promise<GeneratedCode> {
  const [actions, session] = await Promise.all([
    getActionsBySession(sessionId),
    getSession(sessionId),
  ])

  const startUrl = session?.startUrl ?? 'about:blank'
  const sourceActions =
    options.autoWaitEnabled === false ? actions.filter((a) => a.type !== 'wait') : actions
  const { flatSteps } = normalizeActions(sourceActions)
  const pages = groupIntoPages(flatSteps, startUrl)

  if (options.methodRenames && Object.keys(options.methodRenames).length > 0) {
    applyRenames(pages, options.methodRenames)
  }

  const scenario: IRScenario = {
    name: session?.name ?? 'Recorded Scenario',
    pages,
  }

  const doc: IRDocument = {
    sessionId,
    scenario,
    pages,
    generatedAt: Date.now(),
  }

  const adapter = getAdapter(framework)
  adapter.applyOptions?.({
    includeMocks: options.includeMocks,
    testData: options.testData,
    bdd: options.bdd,
  })

  if (options.bdd) {
    if (!adapter.renderBddFeature || !adapter.renderBddSteps || !adapter.renderBddScaffold) {
      throw new Error(
        `Framework ${framework} does not support BDD output yet — disable the BDD toggle or pick a different framework.`,
      )
    }
  }

  const pageFiles = doc.pages.map((page) => adapter.renderPageObject(page))
  const scaffoldFiles = adapter.renderScaffold()

  const allFiles: typeof pageFiles = [...pageFiles]
  if (
    options.bdd &&
    adapter.renderBddFeature &&
    adapter.renderBddSteps &&
    adapter.renderBddScaffold
  ) {
    allFiles.push(adapter.renderBddFeature(scenario))
    allFiles.push(adapter.renderBddSteps(scenario))
    allFiles.push(...scaffoldFiles, ...adapter.renderBddScaffold())
  } else {
    const specFile = adapter.renderScenario(scenario)
    allFiles.push(specFile, ...scaffoldFiles)
  }

  // BDD scaffold overrides vanilla scaffold filenames (package.json, etc.).
  // Dedupe keeping the last occurrence so the override wins.
  const dedupedByFilename = Array.from(
    allFiles
      .reduce((acc, f) => acc.set(f.filename, f), new Map<string, (typeof allFiles)[number]>())
      .values(),
  )

  const finalFiles = adapter.postProcess?.(dedupedByFilename) ?? dedupedByFilename

  return {
    framework,
    files: finalFiles,
  }
}
