import type { GeneratedFile } from '@shared/types/generated'
import type { IRPage, IRScenario } from '../../ir/types'
import { registerAdapter, type FrameworkAdapter } from '../registry'
import { renderPageObject, setSeleniumPyPageObjectTestData } from './page-object'
import { renderScenario, toSnakeCase, setSeleniumPyTestData } from './scenario'
import { renderScaffold, setSeleniumPyScaffoldTestData } from './scaffold'

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
  applyOptions(options) {
    setSeleniumPyTestData(options.testData)
    setSeleniumPyPageObjectTestData(options.testData)
    setSeleniumPyScaffoldTestData(options.testData)
  },
  renderPageObject(page: IRPage): GeneratedFile {
    return {
      filename: `${toSnakeCase(page.className)}.py`,
      content: renderPageObject(page),
    }
  },
  renderScenario(scenario: IRScenario): GeneratedFile {
    return { filename: 'test_scenario.py', content: renderScenario(scenario) }
  },
  renderScaffold() {
    return renderScaffold()
  },
}

registerAdapter(seleniumPyAdapter)
