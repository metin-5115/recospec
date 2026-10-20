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

describe('renderFeatureFile (Playwright BDD)', () => {
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

describe('renderStepsFile (Playwright BDD)', () => {
  it('imports playwright-bdd createBdd and registers step definitions', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain("import { createBdd } from 'playwright-bdd'")
    expect(content).toContain('const { Given, When, Then } = createBdd();')
    expect(content).toMatch(/Given\(.+I am on the \{string\} page/)
    expect(content).toMatch(/When\(.+I log in with email \{string\} and password \{string\}/)
  })

  it('imports the relevant page object', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain("import { LoginPage } from '../../pages/LoginPage'")
  })

  it('step body instantiates POM and calls the inferred method', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain('const loginPage = new LoginPage(page);')
    expect(content).toContain('await loginPage.login(secretValue(arg1), secretValue(arg2));')
  })

  it('deduplicates repeated step patterns', () => {
    const repeating: IRScenario = {
      name: 'Repeat',
      pages: [
        loginPage,
        {
          ...loginPage,
          className: 'LoginPage',
          normalizedUrl: '/login',
        },
      ],
    }
    const content = renderStepsFile(repeating)
    const occurrences = content.match(/I log in with email/g) ?? []
    expect(occurrences.length).toBe(1)
  })
})

describe('renderBddScaffoldFiles', () => {
  it('overrides playwright.config.ts with a BDD-aware version', () => {
    const files = renderBddScaffoldFiles()
    const cfg = files.find((f) => f.filename === 'playwright.config.ts')
    expect(cfg).toBeDefined()
    expect(cfg!.content).toContain("import { defineBddConfig } from 'playwright-bdd'")
    expect(cfg!.content).toContain('features/*.feature')
  })

  it('adds playwright-bdd to package.json devDependencies', () => {
    const files = renderBddScaffoldFiles()
    const pkg = files.find((f) => f.filename === 'package.json')
    expect(pkg).toBeDefined()
    const parsed = JSON.parse(pkg!.content)
    expect(parsed.devDependencies['playwright-bdd']).toBeDefined()
    expect(parsed.scripts.test).toContain('bddgen')
  })
})
