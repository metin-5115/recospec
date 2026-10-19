import { normalizeActions } from './normalizer/action-normalizer'
import { groupIntoPages } from './planner/page-grouper'
import { appendFinalStateAssertion } from './planner/final-assertion'
import { withFillVariants } from './planner/fill-variants'
import './adapters'
import { getAdapter, type RenderOptions } from './adapters/registry'
import { flowSlug } from './shared/flow-slug'
import { recordedOrigin } from './shared/scenario-flow'
import { hasUploadStep } from './shared/upload-fixtures'
import type { FrameworkId, GeneratedCode } from '@shared/types/generated'
import type { RecordedAction } from '@shared/types/action'
import type { GenerateOptions } from '@shared/types/generate-options'
import { normalizeSelection, isEmptySelection } from '@shared/types/generated'
import type { IRDocument, IRScenario } from './ir/types'
import { applyTemplateModes, applyComposedModes } from './planner/template-modes'

export type { GenerateOptions }

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

/** The parts of a recorded session code generation needs. */
export interface GenerateSession {
  sessionId?: string
  name?: string
  startUrl?: string
}

/**
 * The one way from a recording to code: normalize, plan, render. Pure — it reads nothing from
 * IndexedDB or the browser, so the side panel, the worker, the CLI and the VS Code extension all
 * call it with the actions they already hold.
 */
export function generateFromActions(
  session: GenerateSession | undefined,
  actions: readonly RecordedAction[],
  framework: FrameworkId,
  options: GenerateOptions = {},
): GeneratedCode {
  const startUrl = session?.startUrl ?? 'about:blank'
  const sourceActions =
    options.autoWaitEnabled === false ? actions.filter((a) => a.type !== 'wait') : [...actions]
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
    sessionId: session?.sessionId ?? '',
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
    dirs: options.dirs,
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
