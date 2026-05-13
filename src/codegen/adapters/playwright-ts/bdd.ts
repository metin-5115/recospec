import type { GeneratedFile } from '@shared/types/generated'
import type { IRScenario, IRPage } from '../../ir/types'
import {
  mapScenarioToGherkin,
  type GherkinStep,
  type GherkinFeature,
} from '../../bdd/gherkin-mapper'

// ---------------------------------------------------------------------------
// .feature renderer
// ---------------------------------------------------------------------------

function indentBlock(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.length ? `${pad}${line}` : line))
    .join('\n')
}

export function renderFeatureFile(scenario: IRScenario): string {
  const feature: GherkinFeature = mapScenarioToGherkin(scenario)
  const scenarioBlocks = feature.scenarios.map((sc) => {
    const stepLines = sc.steps.map((s) => `${s.keyword} ${s.text}`).join('\n')
    return `Scenario: ${sc.name}\n${indentBlock(stepLines, 2)}`
  })
  return `Feature: ${feature.name}\n\n${indentBlock(scenarioBlocks.join('\n\n'), 2)}\n`
}

// ---------------------------------------------------------------------------
// .steps.ts renderer
// ---------------------------------------------------------------------------

function tsTypeForPlaceholder(p: string): string {
  if (p === '{int}' || p === '{float}') return 'number'
  return 'string'
}

function placeholderTypes(pattern: string): string[] {
  return (pattern.match(/\{(string|int|float)\}/g) ?? []).map(tsTypeForPlaceholder)
}

function pomVarName(page: IRPage): string {
  return page.className.charAt(0).toLowerCase() + page.className.slice(1)
}

/** Render the body of a step definition for the given Gherkin step. */
function renderStepBody(step: GherkinStep, paramNames: string[]): string {
  const page = step.page
  const method = step.method
  const sourceAction = step.sourceSteps[0]?.action

  if (page && method) {
    const pomName = pomVarName(page)
    const args = paramNames.join(', ')
    return [
      `  const ${pomName} = new ${page.className}(page);`,
      `  await ${pomName}.${method.name}(${args});`,
    ].join('\n')
  }

  if (sourceAction === 'navigate' && page) {
    const pomName = pomVarName(page)
    return [`  const ${pomName} = new ${page.className}(page);`, `  await ${pomName}.goto();`].join(
      '\n',
    )
  }

  if (sourceAction === 'click') {
    return `  await page.getByRole('button', { name: ${paramNames[0] ?? '""'} }).click();`
  }
  if (sourceAction === 'fill') {
    return `  await page.getByLabel(${paramNames[0] ?? '""'}).fill(${paramNames[1] ?? '""'});`
  }
  if (sourceAction === 'keypress') {
    return `  await page.keyboard.press(${paramNames[0] ?? '""'});`
  }
  if (sourceAction === 'assert') {
    return `  await expect(page.getByText(${paramNames[0] ?? '""'})).toBeVisible();`
  }
  return `  // TODO: implement step`
}

/**
 * `createBdd` exposes only Given/When/Then. `And` lines in the .feature are
 * Cucumber sugar — the step DEFINITION still must be registered under the
 * canonical keyword of the preceding step. We map based on the text shape.
 */
function canonicalRegistrationKeyword(step: GherkinStep): 'Given' | 'When' | 'Then' {
  if (step.keyword !== 'And') return step.keyword
  const text = step.text.toLowerCase()
  if (text.startsWith('i am on ')) return 'Given'
  if (text.startsWith('the ') || text.startsWith('i should ') || text.startsWith('i verify '))
    return 'Then'
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

      const types = placeholderTypes(step.pattern)
      const names = Array.from({ length: types.length }, (_, i) => `arg${i + 1}`)
      const typedParams = names.map((n, i) => `${n}: ${types[i] ?? 'string'}`).join(', ')
      const fnArgs = typedParams ? `{ page }, ${typedParams}` : `{ page }`

      const body = renderStepBody(step, names)
      const keyword = canonicalRegistrationKeyword(step)
      stepDefs.push(
        `${keyword}(${JSON.stringify(step.pattern)}, async (${fnArgs}) => {\n${body}\n});`,
      )
    }
  }

  const importLines = [`import { createBdd } from 'playwright-bdd';`]
  if (pomImports.size > 0) {
    for (const name of Array.from(pomImports).sort()) {
      importLines.push(`import { ${name} } from '../../pages/${name}';`)
    }
  }
  importLines.push(`import { expect } from '@playwright/test';`)

  return `${importLines.join('\n')}

const { Given, When, Then } = createBdd();

${stepDefs.join('\n\n')}
`
}

// ---------------------------------------------------------------------------
// BDD-specific scaffold (overrides package.json + playwright.config.ts)
// ---------------------------------------------------------------------------

const PLAYWRIGHT_CONFIG_WITH_BDD = `import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: 'features/*.feature',
  steps: ['features/steps/*.ts'],
});

export default defineConfig({
  testDir,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
`

function renderBddPackageJson(): string {
  return JSON.stringify(
    {
      name: 'playforge-generated-tests',
      version: '1.0.0',
      private: true,
      scripts: {
        bddgen: 'bddgen',
        test: 'bddgen && playwright test',
        'test:headed': 'bddgen && playwright test --headed',
      },
      devDependencies: {
        '@playwright/test': '^1.40.0',
        'playwright-bdd': '^7.0.0',
        typescript: '^5.3.0',
      },
    },
    null,
    2,
  )
}

export function renderBddScaffoldFiles(): GeneratedFile[] {
  return [
    { filename: 'package.json', content: renderBddPackageJson() },
    { filename: 'playwright.config.ts', content: PLAYWRIGHT_CONFIG_WITH_BDD },
  ]
}
