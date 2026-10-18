import { describe, it, expect } from 'vitest'
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin'
import { renderFeatureFile, renderStepsFile, renderBddScaffoldFiles } from './bdd'
import { validatePythonSource } from './python-validate'
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

describe('renderFeatureFile (Selenium-py BDD)', () => {
  it('produces a Gherkin-parsable .feature file', () => {
    const content = renderFeatureFile(scenario)
    const doc = parseFeature(content)
    expect(doc.feature?.name).toBe('User can log in')
    const sc = doc.feature?.children[0]?.scenario
    expect(sc?.name).toBe('User can log in')
    const stepKeywords = sc?.steps.map((s) => s.keyword.trim())
    expect(stepKeywords).toEqual(['Given', 'When'])
    expect(sc?.steps[1].text).toBe('I log in with email "admin@example.com" and password "secret"')
  })

  it('feature header lists the scenario name', () => {
    const content = renderFeatureFile(scenario)
    expect(content).toMatch(/^Feature: User can log in/)
    expect(content).toMatch(/Scenario: User can log in/)
  })
})

describe('renderStepsFile (Selenium-py BDD)', () => {
  it('imports pytest-bdd primitives and selenium By/Keys', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain('from pytest_bdd import scenarios, given, when, then, parsers')
    expect(content).toContain('from selenium.webdriver.common.by import By')
    expect(content).toContain('from selenium.webdriver.common.keys import Keys')
  })

  it('imports POM via snake_case module path under pages/', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain('from pages.login_page import LoginPage')
  })

  it('wires @scenarios to the relative feature path', () => {
    const content = renderStepsFile(scenario)
    // step file lives at tests/test_scenario.py, feature lives at
    // features/scenario.feature → relative path is ../features/scenario.feature
    expect(content).toContain(`scenarios('../features/scenario.feature')`)
  })

  it('converts {string} → "{argN}" and registers as parsers.parse', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain('@given(parsers.parse("I am on the \\"{arg1}\\" page"))')
    expect(content).toContain(
      '@when(parsers.parse("I log in with email \\"{arg1}\\" and password \\"{arg2}\\""))',
    )
  })

  it('step body instantiates POM and calls the inferred method (no await — sync)', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain('login_page = LoginPage(driver)')
    expect(content).toContain('login_page.login(arg1, arg2)')
    expect(content).not.toMatch(/\bawait\b/)
  })

  it('calls multi-word methods by the snake_case name the page object defines', () => {
    const renamed: IRScenario = {
      name: 'User can log in',
      pages: [
        {
          ...loginPage,
          inferredMethods: loginPage.inferredMethods?.map((m) => ({ ...m, name: 'submitForm' })),
        },
      ],
    }
    const content = renderStepsFile(renamed)
    expect(content).toContain('login_page.submit_form(arg1, arg2)')
    expect(content).not.toContain('submitForm')
  })

  it('navigate step calls .goto() on the page object', () => {
    const content = renderStepsFile(scenario)
    expect(content).toContain('login_page.goto()')
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

  it('uses parsers.cfparse with :d when an {int} placeholder is present', () => {
    const countEl: IRElement = {
      name: 'itemList',
      locatorStrategy: 'testid',
      locatorValue: '[data-testid="items"]',
      tagName: 'ul',
    }
    const countPage: IRPage = {
      name: 'Inventory',
      className: 'InventoryPage',
      normalizedUrl: '/inventory',
      elements: [countEl],
      steps: [
        { id: 'n', action: 'navigate', url: '/inventory' },
        {
          id: 'a',
          action: 'assert',
          element: countEl,
          assertionDetail: { type: 'count', expected: 5 },
        },
      ],
    }
    const intScenario: IRScenario = {
      name: 'Inventory has items',
      pages: [countPage],
    }
    const content = renderStepsFile(intScenario)
    expect(content).toMatch(/parsers\.cfparse\(.*\{arg1:d\}/)
  })

  it('generated step file parses as valid Python', () => {
    const result = validatePythonSource(renderStepsFile(scenario))
    if (result.skipped) return
    if (!result.ok) {
      throw new Error(`step file failed AST parse:\n${result.error}`)
    }
    expect(result.ok).toBe(true)
  })

  it('handles an int-placeholder step as valid Python (cfparse path)', () => {
    const countEl: IRElement = {
      name: 'itemList',
      locatorStrategy: 'testid',
      locatorValue: '[data-testid="items"]',
      tagName: 'ul',
    }
    const countPage: IRPage = {
      name: 'Inventory',
      className: 'InventoryPage',
      normalizedUrl: '/inventory',
      elements: [countEl],
      steps: [
        { id: 'n', action: 'navigate', url: '/inventory' },
        {
          id: 'a',
          action: 'assert',
          element: countEl,
          assertionDetail: { type: 'count', expected: 5 },
        },
      ],
    }
    const result = validatePythonSource(renderStepsFile({ name: 'inv', pages: [countPage] }))
    if (result.skipped) return
    if (!result.ok) {
      throw new Error(`int-step file failed AST parse:\n${result.error}`)
    }
    expect(result.ok).toBe(true)
  })
})

describe('renderBddScaffoldFiles (Selenium-py BDD)', () => {
  it('overrides requirements.txt to include pytest-bdd', () => {
    const files = renderBddScaffoldFiles()
    const req = files.find((f) => f.filename === 'requirements.txt')
    expect(req).toBeDefined()
    expect(req!.content).toMatch(/pytest-bdd>=/)
    // Keep the rest of the selenium-py stack so the override is self-contained.
    expect(req!.content).toMatch(/selenium>=/)
    expect(req!.content).toMatch(/^pytest>=/m)
    expect(req!.content).toMatch(/webdriver-manager>=/)
  })
})
