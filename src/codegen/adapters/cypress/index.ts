import type { GeneratedFile } from '@shared/types/generated'
import type { IRPage, IRScenario } from '../../ir/types'
import { registerAdapter, type FrameworkAdapter, type RenderOptions } from '../registry'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { renderLocator } from './locator'
import { flowSlug } from '../../shared/flow-slug'
import { nodeBaseUrlExpr } from '../../shared/base-url'
import { renderFixturesScaffold } from '../../shared/upload-fixtures'
import { CYPRESS_SELF_HEALING_JS } from '../../scaffold/self-healing'
import { renderFeatureFile, renderStepsFile, renderBddScaffoldFiles } from './bdd'

export { renderPageObject, renderScenario, renderLocator }

// The real cypress.env.json holds the user's credentials; only its .example is committed.
const CYPRESS_GITIGNORE = `node_modules/
cypress/videos/
cypress.env.json
`

export function renderScaffold(options: RenderOptions = {}): GeneratedFile[] {
  const packageJson = JSON.stringify(
    {
      name: 'recospec-generated-tests',
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
        // date-fns powers parameterized date-template page-object accessors.
        'date-fns': '^3.6.0',
      },
    },
    null,
    2,
  )

  const cypressConfig = `import { defineConfig } from 'cypress';
import { addMatchImageSnapshotPlugin } from 'cypress-image-snapshot/plugin';

export default defineConfig({
  e2e: {
    baseUrl: ${nodeBaseUrlExpr(options.baseUrl)},
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
    { filename: '.gitignore', content: CYPRESS_GITIGNORE },
    ...renderFixturesScaffold(options),
  ]
  const params = options.testData?.params.filter((p) => p.useEnvVar) ?? []
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
  renderPageObject(page: IRPage, options?: RenderOptions): GeneratedFile {
    return { filename: `${page.className}.js`, content: renderPageObject(page, options) }
  },
  renderScenario(scenario: IRScenario, options?: RenderOptions): GeneratedFile {
    return {
      filename: `${flowSlug(scenario.name)}.cy.js`,
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
    return {
      filename: `${flowSlug(scenario.name)}.steps.js`,
      content: renderStepsFile(scenario, options),
    }
  },
  renderBddScaffold(options) {
    return renderBddScaffoldFiles(options)
  },
}

registerAdapter(cypressAdapter)
