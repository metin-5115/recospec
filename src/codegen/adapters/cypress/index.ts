import type { GeneratedFile } from '@shared/types/generated'
import type { IRPage, IRScenario } from '../../ir/types'
import { registerAdapter, type FrameworkAdapter } from '../registry'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { renderLocator } from './locator'

export { renderPageObject, renderScenario, renderLocator }

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
      },
    },
    null,
    2,
  )

  const cypressConfig = `import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.js',
  },
});
`

  const supportFile = `import '@testing-library/cypress/add-commands';
`

  return [
    { filename: 'package.json', content: packageJson },
    { filename: 'cypress.config.js', content: cypressConfig },
    { filename: 'cypress/support/e2e.js', content: supportFile },
  ]
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
