import { describe, it, expect } from 'vitest'
import { renderScenario, toSnakeCase } from './scenario'
import { inferMethods } from '../../planner/method-inferer'
import type { IRPage, IRScenario, IRElement } from '../../ir/types'

// Non-sensitive field name keeps these scenario tests focused on rendering;
// env-var emission for sensitive fields is covered in test-data tests.
const emailEl: IRElement = {
  name: 'usernameInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="login-email"]',
  tagName: 'input',
}

const submitEl: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'role-name',
  locatorValue: `'button', { name: 'Submit' }`,
  tagName: 'button',
}

const loginPage: IRPage = {
  name: 'Login',
  className: 'LoginPage',
  normalizedUrl: '/login',
  elements: [emailEl, submitEl],
  steps: [
    { id: 's1', action: 'navigate', url: '/login' },
    { id: 's2', action: 'fill', element: emailEl, value: 'foo@bar.com' },
    { id: 's3', action: 'click', element: submitEl },
  ],
}

const pageWithMethods: IRPage = { ...loginPage, inferredMethods: inferMethods(loginPage.steps) }

describe('selenium-py renderScenario', () => {
  it('matches snapshot', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expect(renderScenario(scenario)).toMatchSnapshot()
  })

  it('emits a pytest test function', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expect(renderScenario(scenario)).toContain('def test_login_flow(driver):')
  })

  it('emits driver.get for navigate steps', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expect(renderScenario(scenario)).toContain("driver.get('/login')")
  })

  it('emits clear() and send_keys() for fill steps', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    const out = renderScenario(scenario)
    expect(out).toContain('_el.clear()')
    expect(out).toContain("_el.send_keys('foo@bar.com')")
  })

  it('imports page objects from snake_case modules', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [pageWithMethods] }
    expect(renderScenario(scenario)).toContain('from pages.login_page import LoginPage')
  })

  it('creates the page object and calls its method with the recorded value', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [pageWithMethods] }
    const out = renderScenario(scenario)
    expect(out).toContain('    login_page = LoginPage(driver)')
    expect(out).toContain("    login_page.submit_form('foo@bar.com')")
    expect(out).not.toContain('# noqa')
    expect(out).not.toContain('WebDriverWait')
  })

  it('opens the start URL before the first call', () => {
    const steps = loginPage.steps.slice(1)
    const scenario: IRScenario = {
      name: 'Login flow',
      startUrl: 'http://localhost:4500/login',
      pages: [{ ...loginPage, steps, inferredMethods: inferMethods(steps) }],
    }
    const out = renderScenario(scenario)
    expect(
      out.indexOf("driver.get(getattr(driver, 'base_url', 'http://localhost:4500') + '/login')"),
    ).toBeGreaterThan(-1)
    expect(out.indexOf('driver.get(')).toBeLessThan(out.indexOf('login_page.'))
  })

  it('imports os whenever a call reads a secret from the environment', () => {
    const passwordEl: IRElement = {
      name: 'passwordInput',
      locatorStrategy: 'testid',
      locatorValue: 'pw',
      tagName: 'input',
      inputType: 'password',
    }
    const steps = [
      { id: 'p1', action: 'fill' as const, element: passwordEl, value: 'hunter2' },
      { id: 'p2', action: 'click' as const, element: submitEl },
    ]
    const page: IRPage = {
      ...loginPage,
      elements: [passwordEl, submitEl],
      steps,
      inferredMethods: inferMethods(steps),
    }
    const out = renderScenario({ name: 'Secret flow', pages: [page] })
    expect(out).toContain("os.environ.get('RECOSPEC_PASSWORD', 'change-me')")
    expect(out).toMatch(/^import os$/m)
    expect(out).not.toContain('hunter2')
  })
})

describe('selenium-py — toSnakeCase', () => {
  it('converts PascalCase to snake_case', () => {
    expect(toSnakeCase('LoginPage')).toBe('login_page')
    expect(toSnakeCase('UserProfilePage')).toBe('user_profile_page')
    expect(toSnakeCase('A')).toBe('a')
  })
})
