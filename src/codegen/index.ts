import { getActionsBySession } from '@storage/action-repo'
import { getSession } from '@storage/session-repo'
import { normalizeActions } from './normalizer/action-normalizer'
import { groupIntoPages } from './planner/page-grouper'
import './adapters/playwright-ts'
import './adapters/cypress'
import { getAdapter } from './adapters/registry'
import type { FrameworkId, GeneratedCode } from '@shared/types/generated'
import type { IRDocument, IRScenario } from './ir/types'

export async function generate(sessionId: string, framework: FrameworkId): Promise<GeneratedCode> {
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

  const adapter = getAdapter(framework)
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
