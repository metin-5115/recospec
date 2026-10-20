import type { GeneratedFile } from '@shared/types/generated'
import type { IRPage, IRScenario } from '../../ir/types'
import { registerAdapter, type FrameworkAdapter, type RenderOptions } from '../registry'
import { renderPageObject } from './page-object'
import { renderScenario, toJavaMethodName } from './scenario'
import { renderScaffold } from './scaffold'
import { flowPascalName, flowSlug } from '../../shared/flow-slug'
import { renderFeatureFile, renderStepsFile, renderBddScaffoldFiles } from './bdd'
import { withTestDataHelper } from './test-data'

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
  postProcess(files, options) {
    // Page objects and tests call `TestData.get(...)`; the CLI skips the scaffold, so ship the
    // helper whenever the generated code needs it.
    const withHelper = withTestDataHelper(files)
    if (!options?.bdd) return withHelper
    // BDD mode drives test discovery via JUnit Platform Suite (CucumberRunner)
    // — testng.xml from the vanilla scaffold is dead weight; strip it.
    return withHelper.filter((f) => f.filename !== 'testng.xml')
  },
  renderPageObject(page: IRPage, options?: RenderOptions): GeneratedFile {
    return {
      filename: `${page.className}.java`,
      content: renderPageObject(page, options),
    }
  },
  renderScenario(scenario: IRScenario, options?: RenderOptions): GeneratedFile {
    const className = `${flowPascalName(scenario.name)}Test`
    return { filename: `${className}.java`, content: renderScenario(scenario, options) }
  },
  renderScaffold(options) {
    return renderScaffold(options)
  },
  renderBddFeature(scenario) {
    return { filename: `${flowSlug(scenario.name)}.feature`, content: renderFeatureFile(scenario) }
  },
  renderBddSteps(scenario, options) {
    return { filename: 'StepDefinitions.java', content: renderStepsFile(scenario, options) }
  },
  renderBddScaffold() {
    return renderBddScaffoldFiles()
  },
}

registerAdapter(seleniumJavaAdapter)
