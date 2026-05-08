import { describe, it, expect } from 'vitest'
import { renderScenario, toJavaMethodName } from './scenario'
import type { IRPage, IRScenario, IRElement } from '../../ir/types'

const emailEl: IRElement = {
  name: 'emailInput',
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

describe('selenium-java renderScenario', () => {
  it('matches snapshot', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expect(renderScenario(scenario)).toMatchSnapshot()
  })

  it('emits a TestNG test class with the scenario method', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    const out = renderScenario(scenario)
    expect(out).toContain('public class TestLoginFlow {')
    expect(out).toContain('@Test')
    expect(out).toContain('public void loginFlow() {')
  })

  it('emits @BeforeMethod / @AfterMethod fixtures', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    const out = renderScenario(scenario)
    expect(out).toContain('@BeforeMethod')
    expect(out).toContain('public void setUp() {')
    expect(out).toContain('@AfterMethod')
    expect(out).toContain('public void tearDown() {')
    expect(out).toContain('driver.quit();')
  })

  it('emits driver.get for navigate steps', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expect(renderScenario(scenario)).toContain(`driver.get("/login");`)
  })

  it('emits clear() and sendKeys() for fill steps', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    const out = renderScenario(scenario)
    expect(out).toContain('_el.clear();')
    expect(out).toContain(`_el.sendKeys("foo@bar.com");`)
  })

  it('imports page object classes', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expect(renderScenario(scenario)).toContain('import pages.LoginPage;')
  })

  it('instantiates page objects in the test method', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expect(renderScenario(scenario)).toContain('LoginPage loginPage = new LoginPage(driver);')
  })

  it('respects -Dheaded system property in setUp', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expect(renderScenario(scenario)).toContain(`System.getProperty("headed", "false")`)
    expect(renderScenario(scenario)).toContain(`options.addArguments("--headless=new");`)
  })
})

describe('selenium-java — toJavaMethodName', () => {
  it('camelCases scenario name with spaces', () => {
    expect(toJavaMethodName('Login flow')).toBe('loginFlow')
    expect(toJavaMethodName('User profile page')).toBe('userProfilePage')
  })

  it('returns "flow" for empty input', () => {
    expect(toJavaMethodName('')).toBe('flow')
    expect(toJavaMethodName('   ')).toBe('flow')
  })

  it('strips non-alphanumeric characters', () => {
    expect(toJavaMethodName('login-flow!')).toBe('loginFlow')
  })
})
