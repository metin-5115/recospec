import type { GeneratedFile } from '@shared/types/generated'
import type { IRPage, IRScenario } from '../../ir/types'
import { registerAdapter, type FrameworkAdapter, type RenderOptions } from '../registry'
import { renderPageObject } from './page-object'
import { renderScenario, toJavaMethodName } from './scenario'
import { renderScaffold } from './scaffold'
import { flowPascalName, flowSlug } from '../../shared/flow-slug'
import { renderFeatureFile, renderStepsFile, renderBddScaffoldFiles } from './bdd'

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
    if (!options?.bdd) return files
    // BDD mode drives test discovery via JUnit Platform Suite (CucumberRunner)
    // — testng.xml from the vanilla scaffold is dead weight; strip it.
    return files.filter((f) => f.filename !== 'testng.xml')
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
  renderBddSteps(scenario) {
    return { filename: 'StepDefinitions.java', content: renderStepsFile(scenario) }
  },
  renderBddScaffold() {
    return renderBddScaffoldFiles()
  },
}

registerAdapter(seleniumJavaAdapter)
