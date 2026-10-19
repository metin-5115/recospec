import { getActionsBySession } from '@storage/action-repo'
import { getSession } from '@storage/session-repo'
import { normalizeActions } from './normalizer/action-normalizer'
import { groupIntoPages } from './planner/page-grouper'
import { appendFinalStateAssertion } from './planner/final-assertion'
import { withFillVariants } from './planner/fill-variants'
import './adapters/playwright-ts'
import './adapters/cypress'
import './adapters/selenium-py'
import './adapters/selenium-java'
import { getAdapter, type RenderOptions } from './adapters/registry'
import { flowSlug } from './shared/flow-slug'
import { recordedOrigin } from './shared/scenario-flow'
import { hasUploadStep } from './shared/upload-fixtures'
import type { FrameworkId, GeneratedCode, OutputSelection } from '@shared/types/generated'
import { normalizeSelection, isEmptySelection } from '@shared/types/generated'
import type { IRDocument, IRScenario, TestDataConfig, TemplateParamMode } from './ir/types'
import {
  applyTemplateModes,
  applyComposedModes,
  type ComposedParamMode,
} from './planner/template-modes'

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
  /**
   * Append a "the flow ended on this URL" assertion to a recording the user never asserted on.
   * Defaults to `true`.
   */
  finalStateAssertion?: boolean
  /**
   * Let the recorded fallback locators take over at run time (Playwright / Cypress only; the
   * Selenium adapters list them as suggestions). Defaults to `true`.
   */
  selfHealing?: boolean
  /** Emit Gherkin `.feature` + step definitions alongside the page objects. */
  bdd?: boolean
  /**
   * Which file groups to emit. Defaults to all (page objects + test +
   * scaffold) so existing callers are unaffected. An unselected group is never
   * rendered.
   */
  selection?: Partial<OutputSelection>
  /**
   * Per-template rendering modes keyed by the element's `locatorValue`.
   * Omitted templates default to `param` (parameterized method).
   */
  templateModes?: Record<string, TemplateParamMode>
  /**
   * Per-element container-anchor modes keyed by `locatorValue`: `scoped`
   * (default, hardcoded label) or `param` (label becomes a method parameter).
   */
  composedModes?: Record<string, ComposedParamMode>
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
  const normalized = normalizeActions(sourceActions).flatSteps
  const flatSteps =
    options.finalStateAssertion === false ? normalized : appendFinalStateAssertion(normalized)
  // Before grouping — method inference reads templateParamMode / composedParamMode.
  applyTemplateModes(flatSteps, options.templateModes)
  applyComposedModes(flatSteps, options.composedModes)
  const pages = groupIntoPages(flatSteps, startUrl)

  if (options.methodRenames && Object.keys(options.methodRenames).length > 0) {
    applyRenames(pages, options.methodRenames)
  }

  const scenario: IRScenario = {
    name: session?.name ?? 'Recorded Scenario',
    startUrl: session?.startUrl,
    pages,
  }

  const doc: IRDocument = {
    sessionId,
    scenario,
    pages,
    generatedAt: Date.now(),
  }

  const adapter = getAdapter(framework)
  const renderOptions: RenderOptions = {
    includeMocks: options.includeMocks,
    selfHealing: options.selfHealing !== false,
    testData: withFillVariants(options.testData, normalized),
    bdd: options.bdd,
    flowSlug: flowSlug(scenario.name),
    baseUrl: recordedOrigin(scenario),
    hasUploads: hasUploadStep(flatSteps),
  }

  const selection = normalizeSelection(options.selection)
  if (isEmptySelection(selection)) {
    throw new Error(
      'Nothing to generate — select at least one output (page objects, test, or scaffold).',
    )
  }

  // BDD capability only matters when a BDD test is actually requested.
  if (options.bdd && selection.test) {
    if (!adapter.renderBddFeature || !adapter.renderBddSteps || !adapter.renderBddScaffold) {
      throw new Error(
        `Framework ${framework} does not support BDD output yet — disable the BDD toggle or pick a different framework.`,
      )
    }
  }

  const allFiles: ReturnType<typeof adapter.renderPageObject>[] = []
  if (selection.pageObjects) {
    allFiles.push(...doc.pages.map((page) => adapter.renderPageObject(page, renderOptions)))
  }

  const renderBdd =
    options.bdd && adapter.renderBddFeature && adapter.renderBddSteps && adapter.renderBddScaffold
  if (selection.test) {
    if (renderBdd) {
      allFiles.push(adapter.renderBddFeature!(scenario, renderOptions))
      allFiles.push(adapter.renderBddSteps!(scenario, renderOptions))
    } else {
      allFiles.push(adapter.renderScenario(scenario, renderOptions))
    }
  }
  if (selection.scaffold) {
    allFiles.push(...adapter.renderScaffold(renderOptions))
    if (renderBdd) {
      allFiles.push(...adapter.renderBddScaffold!(renderOptions))
    }
  }

  // BDD scaffold overrides vanilla scaffold filenames (package.json, etc.).
  // Dedupe keeping the last occurrence so the override wins.
  const dedupedByFilename = Array.from(
    allFiles
      .reduce((acc, f) => acc.set(f.filename, f), new Map<string, (typeof allFiles)[number]>())
      .values(),
  )

  const finalFiles = adapter.postProcess?.(dedupedByFilename, renderOptions) ?? dedupedByFilename

  return {
    framework,
    files: finalFiles,
  }
}
