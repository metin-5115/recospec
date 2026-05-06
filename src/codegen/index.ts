import { getActionsBySession } from '@storage/action-repo'
import { getSession } from '@storage/session-repo'
import { normalizeActions } from './normalizer/action-normalizer'
import { groupIntoPages } from './planner/page-grouper'
import { renderPageObject, renderScenario, renderScaffold } from './adapters/playwright-ts'
import type { GeneratedCode, IRDocument, IRScenario } from './ir/types'

export async function generate(
  sessionId: string,
  _framework: 'playwright-ts',
): Promise<GeneratedCode> {
  const [actions, session] = await Promise.all([
    getActionsBySession(sessionId),
    getSession(sessionId),
  ])

  const startUrl = session?.startUrl ?? 'about:blank'
  const { flatSteps } = normalizeActions(actions)
  const pages = groupIntoPages(flatSteps, startUrl)

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

  const pageFiles = doc.pages.map((page) => ({
    filename: `${page.className}.ts`,
    content: renderPageObject(page),
  }))

  const specFile = {
    filename: 'scenario.spec.ts',
    content: renderScenario(scenario),
  }

  const scaffoldFiles = renderScaffold()

  return {
    framework: 'playwright-ts',
    files: [...pageFiles, specFile, ...scaffoldFiles],
  }
}
