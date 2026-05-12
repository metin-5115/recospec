import type { GeneratedFile } from '@shared/types/generated'
import type { IRPage, IRScenario, TestDataConfig } from '../../ir/types'
import { registerAdapter, type FrameworkAdapter } from '../registry'
import { renderPageObject } from './page-object'
import { renderScenario, setCypressTestData } from './scenario'
import { setCypressPageObjectTestData } from './page-object'
import { renderLocator } from './locator'
import { CYPRESS_SELF_HEALING_JS } from '../../scaffold/self-healing'

export { renderPageObject, renderScenario, renderLocator }

let TEST_DATA: TestDataConfig | undefined

export function renderScaffold(): GeneratedFile[] {
  const packageJson = JSON.stringify(
    {
      name: 'playforge-generated-tests',
      version: '1.0.0',
      private: true,
      scripts: {
        test: 'cypress run',
        'test:open': 'cypress open',
      },
      devDependencies: {
        cypress: '^13.6.0',
        '@testing-library/cypress': '^10.0.1',
        'cypress-image-snapshot': '^4.0.1',
      },
    },
    null,
    2,
  )

  const cypressConfig = `import { defineConfig } from 'cypress';
import { addMatchImageSnapshotPlugin } from 'cypress-image-snapshot/plugin';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.js',
    setupNodeEvents(on, config) {
      addMatchImageSnapshotPlugin(on, config);
      return config;
    },
  },
});
`

  const supportFile = `import '@testing-library/cypress/add-commands';
import { addMatchImageSnapshotCommand } from 'cypress-image-snapshot/command';
import './locator';

addMatchImageSnapshotCommand({
  failureThreshold: 0.02,
  failureThresholdType: 'percent',
  customDiffDir: 'cypress/screenshots/__diff_output__',
  customSnapshotsDir: 'cypress/screenshots',
});
`

  const files: GeneratedFile[] = [
    { filename: 'package.json', content: packageJson },
    { filename: 'cypress.config.js', content: cypressConfig },
    { filename: 'cypress/support/e2e.js', content: supportFile },
    { filename: 'cypress/support/locator.js', content: CYPRESS_SELF_HEALING_JS },
    { filename: 'cypress/screenshots/.gitkeep', content: '' },
  ]
  const params = TEST_DATA?.params.filter((p) => p.useEnvVar) ?? []
  if (params.length) {
    const envObject: Record<string, string> = {}
    for (const p of params) envObject[p.name] = p.isSecret ? '' : p.defaultValue
    files.push({
      filename: 'cypress.env.json.example',
      content: JSON.stringify(envObject, null, 2) + '\n',
    })
  }
  return files
}

export const cypressAdapter: FrameworkAdapter = {
  id: 'cypress',
  displayName: 'Cypress',
  fileExtension: 'js',
  metadata: {
    language: 'JavaScript',
    testRunner: 'cypress',
    packageName: 'cypress',
  },
  applyOptions(options) {
    TEST_DATA = options.testData
    setCypressTestData(options.testData)
    setCypressPageObjectTestData(options.testData)
  },
  renderPageObject(page: IRPage): GeneratedFile {
    return { filename: `${page.className}.js`, content: renderPageObject(page) }
  },
  renderScenario(scenario: IRScenario): GeneratedFile {
    return { filename: 'scenario.cy.js', content: renderScenario(scenario) }
  },
  renderScaffold() {
    return renderScaffold()
  },
}

registerAdapter(cypressAdapter)
