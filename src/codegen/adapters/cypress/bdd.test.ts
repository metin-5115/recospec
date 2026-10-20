import { describe, it, expect } from 'vitest'
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin'
import { renderFeatureFile, renderStepsFile, renderBddScaffoldFiles } from './bdd'
import type { IRElement, IRPage, IRScenario } from '../../ir/types'

const emailEl: IRElement = {
  name: 'emailInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="email"]',
  tagName: 'input',
  inputType: 'email',
}
const passwordEl: IRElement = {
  name: 'passwordInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="password"]',
  tagName: 'input',
  inputType: 'password',
}
const submitEl: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="submit"]',
  tagName: 'button',
}

const loginPage: IRPage = {
  name: 'Login',
  className: 'LoginPage',
  normalizedUrl: '/login',
  steps: [
    { id: 's0', action: 'navigate', url: '/login' },
    { id: 's1', action: 'fill', element: emailEl, value: 'admin@example.com' },
    { id: 's2', action: 'fill', element: passwordEl, value: 'secret' },
    { id: 's3', action: 'click', element: submitEl },
  ],
  elements: [emailEl, passwordEl, submitEl],
  inferredMethods: [
    {
      name: 'login',
      params: ['email', 'password'],
      paramTypes: ['string', 'string'],
      steps: [
        { id: 's1', action: 'fill', element: emailEl, value: 'admin@example.com' },
        { id: 's2', action: 'fill', element: passwordEl, value: 'secret' },
        { id: 's3', action: 'click', element: submitEl },
      ],
    },
  ],
}

const scenario: IRScenario = { name: 'User can log in', pages: [loginPage] }

function parseFeature(content: string) {
  let counter = 0
  const parser = new Parser(
    new AstBuilder(() => String(++counter)),
    new GherkinClassicTokenMatcher(),
  )
  return parser.parse(content)
}

describe('renderFeatureFile (Cypress BDD)', () => {
  it('produces a Gherkin-parsable .feature file', () => {
    const content = renderFeatureFile(scenario)
    const doc = parseFeature(content)
    expect(doc.feature?.name).toBe('User can log in')
    const sc = doc.feature?.children[0]?.scenario
    expect(sc?.name).toBe('User can log in')
    const stepKeywords = sc?.steps.map((s) => s.keyword.trim())
    expect(stepKeywords).toEqual(['Given', 'When'])
    expect(sc?.steps[1].text).toBe(
      'I log in with email "$RECOSPEC_EMAIL" and password "$RECOSPEC_PASSWORD"',
    )
  })

  it('feature header lists the scenario name', () => {
    const content = renderFeatureFile(scenario)
    expect(content).toMatch(/^Feature: User can log in/)
    expect(content).toMatch(/Scenario: User can log in/)
  })
})

describe('renderStepsFile (Cypress BDD)', () => {
  it('imports Given/When/Then from @badeball/cypress-cucumber-preprocessor', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain(
      "import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';",
    )
  })

  it('registers Given/When step definitions for navigation and login', () => {
    const content = renderStepsFile(scenario)
    expect(content).toMatch(/Given\(.+I am on the \{string\} page/)
    expect(content).toMatch(/When\(.+I log in with email \{string\} and password \{string\}/)
  })

  it('imports the page object using a relative path two levels up', () => {
    const content = renderStepsFile(scenario)
    // step file lives at cypress/e2e/<feature>/<feature>.steps.js,
    // POM lives at cypress/pages/LoginPage.js → ../../pages/LoginPage
    expect(content).toContain("import { LoginPage } from '../../pages/LoginPage';")
  })

  it('step body instantiates POM and calls the inferred method (no await)', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain('const loginPage = new LoginPage();')
    expect(content).toContain('loginPage.login(secretValue(arg1), secretValue(arg2));')
    // Cypress chainables are not promises — no `await`.
    expect(content).not.toMatch(/\bawait\s+loginPage/)
  })

  it('navigate step calls .visit() on the page object', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain('loginPage.visit();')
  })

  it('deduplicates repeated step patterns', () => {
    const repeating: IRScenario = {
      name: 'Repeat',
      pages: [loginPage, { ...loginPage }],
    }
    const content = renderStepsFile(repeating)
    const occurrences = content.match(/I log in with email/g) ?? []
    expect(occurrences.length).toBe(1)
  })
})

describe('renderBddScaffoldFiles (Cypress BDD)', () => {
  it('overrides cypress.config.js with cucumber preprocessor wiring', () => {
    const files = renderBddScaffoldFiles()
    const cfg = files.find((f) => f.filename === 'cypress.config.js')
    expect(cfg).toBeDefined()
    expect(cfg!.content).toContain(
      "import { addCucumberPreprocessorPlugin } from '@badeball/cypress-cucumber-preprocessor';",
    )
    expect(cfg!.content).toContain(
      "import { createEsbuildPlugin } from '@badeball/cypress-cucumber-preprocessor/esbuild';",
    )
    expect(cfg!.content).toContain("specPattern: 'cypress/e2e/**/*.feature'")
    expect(cfg!.content).toContain('addCucumberPreprocessorPlugin(on, config)')
  })

  it('overrides package.json with cucumber + esbuild deps and stepDefinitions config', () => {
    const files = renderBddScaffoldFiles()
    const pkg = files.find((f) => f.filename === 'package.json')
    expect(pkg).toBeDefined()
    const parsed = JSON.parse(pkg!.content)
    expect(parsed.devDependencies['@badeball/cypress-cucumber-preprocessor']).toBeDefined()
    expect(parsed.devDependencies['@bahmutov/cypress-esbuild-preprocessor']).toBeDefined()
    expect(parsed.devDependencies['esbuild']).toBeDefined()
    // The preprocessor's stepDefinitions pattern must use [filepath] so it
    // resolves a feature at cypress/e2e/scenario.feature to the steps folder
    // at cypress/e2e/scenario/.
    expect(parsed['cypress-cucumber-preprocessor'].stepDefinitions).toBe(
      'cypress/e2e/[filepath]/**/*.{js,ts}',
    )
  })
})
