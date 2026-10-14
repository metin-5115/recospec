import type { GeneratedFile } from '@shared/types/generated'
import type { IRScenario, IRPage } from '../../ir/types'
import { mapScenarioToGherkin, literalArgsFor, type GherkinStep } from '../../bdd/gherkin-mapper'

export { renderFeatureFile } from '../../bdd/feature-file'

// ---------------------------------------------------------------------------
// .steps.js renderer
// ---------------------------------------------------------------------------

function placeholderCount(pattern: string): number {
  return (pattern.match(/\{(string|int|float)\}/g) ?? []).length
}

function pomVarName(page: IRPage): string {
  return page.className.charAt(0).toLowerCase() + page.className.slice(1)
}

/**
 * Cypress commands return chainables, not promises — step bodies are
 * synchronous from the user's perspective. POM methods use `cy.*` internally
 * and Cypress queues them automatically.
 */
/** Recorded steps that need no step-definition code of their own. */
const NO_OP_ACTIONS = new Set(['wait', 'network'])

function renderStepBody(step: GherkinStep, paramNames: string[]): string {
  const page = step.page
  const method = step.method
  const sourceAction = step.sourceSteps[0]?.action

  if (page && method) {
    const pomName = pomVarName(page)
    const args = [...paramNames, ...literalArgsFor(step, paramNames.length, 'js')].join(', ')
    return [
      `  const ${pomName} = new ${page.className}();`,
      `  ${pomName}.${method.name}(${args});`,
    ].join('\n')
  }

  if (sourceAction === 'navigate' && page) {
    const pomName = pomVarName(page)
    return [`  const ${pomName} = new ${page.className}();`, `  ${pomName}.visit();`].join('\n')
  }

  if (sourceAction === 'click') {
    return `  cy.contains(${paramNames[0] ?? '""'}).click();`
  }
  if (sourceAction === 'fill') {
    return `  cy.findByLabelText(${paramNames[0] ?? '""'}).clear().type(${paramNames[1] ?? '""'});`
  }
  if (sourceAction === 'select') {
    return `  cy.findByLabelText(${paramNames[1] ?? '""'}).select(${paramNames[0] ?? '""'});`
  }
  if (sourceAction === 'check' || sourceAction === 'uncheck') {
    return `  cy.findByLabelText(${paramNames[0] ?? '""'}).${sourceAction}();`
  }
  if (sourceAction === 'hover') {
    return `  cy.contains(${paramNames[0] ?? '""'}).trigger('mouseover');`
  }
  if (sourceAction === 'dblclick') {
    return `  cy.contains(${paramNames[0] ?? '""'}).dblclick();`
  }
  if (sourceAction === 'keypress') {
    return `  cy.focused().type(\`{\${String(${paramNames[0] ?? '""'}).toLowerCase()}}\`);`
  }
  if (sourceAction === 'assert') {
    return `  cy.contains(${paramNames[0] ?? '""'}).should('be.visible');`
  }
  if (sourceAction && NO_OP_ACTIONS.has(sourceAction)) {
    return `  // No-op: ${sourceAction} steps are covered by Cypress retry-ability.`
  }
  return `  throw new Error(${JSON.stringify(`Unsupported recorded step: ${sourceAction ?? 'unknown'}`)});`
}

/**
 * `@badeball/cypress-cucumber-preprocessor` exposes only Given/When/Then. `And`
 * lines in the .feature are Gherkin sugar — the step DEFINITION must be
 * registered under the canonical keyword of the preceding step. We pick it
 * from the text shape, matching the Playwright adapter's heuristic.
 */
function canonicalRegistrationKeyword(step: GherkinStep): 'Given' | 'When' | 'Then' {
  if (step.keyword !== 'And') return step.keyword
  const text = step.text.toLowerCase()
  if (text.startsWith('i am on ')) return 'Given'
  if (text.startsWith('the ') || text.startsWith('i should ') || text.startsWith('i verify ')) {
    return 'Then'
  }
  return 'When'
}

export function renderStepsFile(scenario: IRScenario): string {
  const feature = mapScenarioToGherkin(scenario)
  const seenPatterns = new Set<string>()
  const stepDefs: string[] = []
  const pomImports = new Set<string>()

  for (const sc of feature.scenarios) {
    for (const step of sc.steps) {
      if (seenPatterns.has(step.pattern)) continue
      seenPatterns.add(step.pattern)

      if (step.page) pomImports.add(step.page.className)

      const count = placeholderCount(step.pattern)
      const names = Array.from({ length: count }, (_, i) => `arg${i + 1}`)
      const fnArgs = names.join(', ')

      const body = renderStepBody(step, names)
      const keyword = canonicalRegistrationKeyword(step)
      stepDefs.push(`${keyword}(${JSON.stringify(step.pattern)}, (${fnArgs}) => {\n${body}\n});`)
    }
  }

  // Step file lives at `cypress/e2e/<feature>/<feature>.steps.js`; POMs live
  // at `cypress/pages/<Name>.js`. Relative import: two levels up.
  const importLines = [
    `import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';`,
  ]
  if (pomImports.size > 0) {
    for (const name of Array.from(pomImports).sort()) {
      importLines.push(`import { ${name} } from '../../pages/${name}';`)
    }
  }

  return `${importLines.join('\n')}

${stepDefs.join('\n\n')}
`
}

// ---------------------------------------------------------------------------
// BDD-specific scaffold (overrides cypress.config.js + package.json)
// ---------------------------------------------------------------------------

const CYPRESS_BDD_CONFIG = `import { defineConfig } from 'cypress';
import createBundler from '@bahmutov/cypress-esbuild-preprocessor';
import { addCucumberPreprocessorPlugin } from '@badeball/cypress-cucumber-preprocessor';
import { createEsbuildPlugin } from '@badeball/cypress-cucumber-preprocessor/esbuild';
import { addMatchImageSnapshotPlugin } from 'cypress-image-snapshot/plugin';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.feature',
    async setupNodeEvents(on, config) {
      await addCucumberPreprocessorPlugin(on, config);
      addMatchImageSnapshotPlugin(on, config);
      on(
        'file:preprocessor',
        createBundler({
          plugins: [createEsbuildPlugin(config)],
        }),
      );
      return config;
    },
  },
});
`

function renderBddPackageJson(): string {
  return JSON.stringify(
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
        '@badeball/cypress-cucumber-preprocessor': '^20.0.0',
        '@bahmutov/cypress-esbuild-preprocessor': '^2.2.0',
        esbuild: '^0.20.0',
      },
      'cypress-cucumber-preprocessor': {
        stepDefinitions: 'cypress/e2e/[filepath]/**/*.{js,ts}',
      },
    },
    null,
    2,
  )
}

export function renderBddScaffoldFiles(): GeneratedFile[] {
  return [
    { filename: 'package.json', content: renderBddPackageJson() },
    { filename: 'cypress.config.js', content: CYPRESS_BDD_CONFIG },
  ]
}
