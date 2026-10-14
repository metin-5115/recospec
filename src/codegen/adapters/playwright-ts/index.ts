import { registerAdapter, type FrameworkAdapter } from '../registry'
import { renderFeatureFile, renderStepsFile, renderBddScaffoldFiles } from './bdd'
import { setRenderMocks, setTestData } from './state'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { renderScaffold } from './scaffold'

// Public surface kept stable for tests and callers that import from the adapter root.
export { renderLocator } from './locator'
export { renderPageObject, renderScenario, renderScaffold }

export const playwrightTsAdapter: FrameworkAdapter = {
  id: 'playwright-ts',
  displayName: 'Playwright TS',
  fileExtension: 'ts',
  metadata: {
    language: 'TypeScript',
    testRunner: '@playwright/test',
    packageName: '@playwright/test',
  },
  applyOptions(options) {
    setRenderMocks(Boolean(options.includeMocks))
    setTestData(options.testData)
  },
  renderPageObject(page) {
    return { filename: `${page.className}.ts`, content: renderPageObject(page) }
  },
  renderScenario(scenario) {
    return { filename: 'scenario.spec.ts', content: renderScenario(scenario) }
  },
  renderScaffold() {
    return renderScaffold()
  },
  renderBddFeature(scenario) {
    return { filename: 'scenario.feature', content: renderFeatureFile(scenario) }
  },
  renderBddSteps(scenario) {
    return { filename: 'scenario.steps.ts', content: renderStepsFile(scenario) }
  },
  renderBddScaffold() {
    return renderBddScaffoldFiles()
  },
}

registerAdapter(playwrightTsAdapter)
