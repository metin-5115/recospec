import type { GeneratedFile } from '@shared/types/generated'
import type { IRPage, IRScenario } from '../../ir/types'
import { registerAdapter, type FrameworkAdapter } from '../registry'
import { renderPageObject, setSeleniumJavaPageObjectTestData } from './page-object'
import { renderScenario, toJavaMethodName, setSeleniumJavaTestData } from './scenario'
import { renderScaffold, setSeleniumJavaScaffoldTestData } from './scaffold'

export { renderPageObject, renderScenario, renderScaffold, toJavaMethodName }

export const seleniumJavaAdapter: FrameworkAdapter = {
  id: 'selenium-java',
  displayName: 'Selenium Java',
  fileExtension: 'java',
  metadata: {
    language: 'Java',
    testRunner: 'TestNG',
    packageName: 'org.seleniumhq.selenium:selenium-java',
  },
  applyOptions(options) {
    setSeleniumJavaTestData(options.testData)
    setSeleniumJavaPageObjectTestData(options.testData)
    setSeleniumJavaScaffoldTestData(options.testData)
  },
  renderPageObject(page: IRPage): GeneratedFile {
    return {
      filename: `${page.className}.java`,
      content: renderPageObject(page),
    }
  },
  renderScenario(scenario: IRScenario): GeneratedFile {
    const suffix = toJavaMethodName(scenario.name)
    const className = `Test${suffix.charAt(0).toUpperCase() + suffix.slice(1)}`
    return { filename: `${className}.java`, content: renderScenario(scenario) }
  },
  renderScaffold() {
    return renderScaffold()
  },
}

registerAdapter(seleniumJavaAdapter)
