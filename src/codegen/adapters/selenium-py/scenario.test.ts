import { describe, it, expect } from 'vitest'
import { renderScenario, toSnakeCase } from './scenario'
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
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expect(renderScenario(scenario)).toContain('from pages.login_page import LoginPage')
  })
})

describe('selenium-py — toSnakeCase', () => {
  it('converts PascalCase to snake_case', () => {
    expect(toSnakeCase('LoginPage')).toBe('login_page')
    expect(toSnakeCase('UserProfilePage')).toBe('user_profile_page')
    expect(toSnakeCase('A')).toBe('a')
  })
})
