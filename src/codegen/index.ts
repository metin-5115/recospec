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
import type { IRDocument, IRScenario } from './ir/types'

export interface GenerateOptions {
  /** Emit `page.route(...)` mocks for any captured network actions. */
  includeMocks?: boolean
  /** Map of `${pageClassName}.${inferredName}` → user-chosen name. */
  methodRenames?: Record<string, string>
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
  const { flatSteps } = normalizeActions(actions)
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
  adapter.applyOptions?.({ includeMocks: options.includeMocks })
  const pageFiles = doc.pages.map((page) => adapter.renderPageObject(page))
  const specFile = adapter.renderScenario(scenario)
  const scaffoldFiles = adapter.renderScaffold()

  const allFiles = [...pageFiles, specFile, ...scaffoldFiles]
  const finalFiles = adapter.postProcess?.(allFiles) ?? allFiles

  return {
    framework,
    files: finalFiles,
  }
}
