import { registerAdapter, type FrameworkAdapter } from '../registry'
import { renderFeatureFile, renderStepsFile, renderBddScaffoldFiles } from './bdd'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { renderScaffold } from './scaffold'
import { flowSlug } from '../../shared/flow-slug'

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
  renderPageObject(page, options) {
    return { filename: `${page.className}.ts`, content: renderPageObject(page, options) }
  },
  renderScenario(scenario, options) {
    return {
      filename: `${flowSlug(scenario.name)}.spec.ts`,
      content: renderScenario(scenario, options),
    }
  },
  renderScaffold(options) {
    return renderScaffold(options)
  },
  renderBddFeature(scenario) {
    return { filename: `${flowSlug(scenario.name)}.feature`, content: renderFeatureFile(scenario) }
  },
  renderBddSteps(scenario) {
    return { filename: `${flowSlug(scenario.name)}.steps.ts`, content: renderStepsFile(scenario) }
  },
  renderBddScaffold() {
    return renderBddScaffoldFiles()
  },
}

registerAdapter(playwrightTsAdapter)
