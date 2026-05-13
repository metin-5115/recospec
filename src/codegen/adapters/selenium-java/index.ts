import type { GeneratedFile } from '@shared/types/generated'
import type { IRPage, IRScenario } from '../../ir/types'
import { registerAdapter, type FrameworkAdapter } from '../registry'
import { renderPageObject, setSeleniumJavaPageObjectTestData } from './page-object'
import { renderScenario, toJavaMethodName, setSeleniumJavaTestData } from './scenario'
import { renderScaffold, setSeleniumJavaScaffoldTestData } from './scaffold'
import { renderFeatureFile, renderStepsFile, renderBddScaffoldFiles } from './bdd'

export { renderPageObject, renderScenario, renderScaffold, toJavaMethodName }

let BDD_MODE = false

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
    BDD_MODE = Boolean(options.bdd)
    setSeleniumJavaTestData(options.testData)
    setSeleniumJavaPageObjectTestData(options.testData)
    setSeleniumJavaScaffoldTestData(options.testData)
  },
  postProcess(files) {
    if (!BDD_MODE) return files
    // BDD mode drives test discovery via JUnit Platform Suite (CucumberRunner)
    // — testng.xml from the vanilla scaffold is dead weight; strip it.
    return files.filter((f) => f.filename !== 'testng.xml')
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
  renderBddFeature(scenario) {
    return { filename: 'scenario.feature', content: renderFeatureFile(scenario) }
  },
  renderBddSteps(scenario) {
    return { filename: 'StepDefinitions.java', content: renderStepsFile(scenario) }
  },
  renderBddScaffold() {
    return renderBddScaffoldFiles()
  },
}

registerAdapter(seleniumJavaAdapter)
