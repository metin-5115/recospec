import type { GeneratedFile } from '@shared/types/generated'
import type { IRPage, IRScenario } from '../../ir/types'
import { registerAdapter, type FrameworkAdapter, type RenderOptions } from '../registry'
import { renderPageObject } from './page-object'
import { renderScenario, toSnakeCase } from './scenario'
import { renderScaffold } from './scaffold'
import { flowSlug, flowSnakeSlug } from '../../shared/flow-slug'
import { renderFeatureFile, renderStepsFile, renderBddScaffoldFiles } from './bdd'

export { renderPageObject, renderScenario, renderScaffold, toSnakeCase }

export const seleniumPyAdapter: FrameworkAdapter = {
  id: 'selenium-py',
  displayName: 'Selenium Python',
  fileExtension: 'py',
  metadata: {
    language: 'Python',
    testRunner: 'pytest',
    packageName: 'selenium',
  },
  renderPageObject(page: IRPage, options?: RenderOptions): GeneratedFile {
    return {
      filename: `${toSnakeCase(page.className)}.py`,
      content: renderPageObject(page, options),
    }
  },
  renderScenario(scenario: IRScenario, options?: RenderOptions): GeneratedFile {
    return {
      filename: `test_${flowSnakeSlug(scenario.name)}.py`,
      content: renderScenario(scenario, options),
    }
  },
  renderScaffold(options) {
    return renderScaffold(options)
  },
  renderBddFeature(scenario) {
    return { filename: `${flowSlug(scenario.name)}.feature`, content: renderFeatureFile(scenario) }
  },
  renderBddSteps(scenario, options) {
    // `test_*.py` so zip-export routes it into `tests/` alongside conftest.py.
    return {
      filename: `test_${flowSnakeSlug(scenario.name)}.py`,
      content: renderStepsFile(scenario, options),
    }
  },
  renderBddScaffold() {
    return renderBddScaffoldFiles()
  },
}

registerAdapter(seleniumPyAdapter)
