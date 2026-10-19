import { describe, it, expect } from 'vitest'
import { renderScenario, toJavaMethodName } from './scenario'
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

describe('selenium-java renderScenario', () => {
  it('matches snapshot', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expect(renderScenario(scenario)).toMatchSnapshot()
  })

  it('emits a TestNG test class with the scenario method', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    const out = renderScenario(scenario)
    expect(out).toContain('public class LoginFlowTest {')
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
    const scenario: IRScenario = { name: 'Login flow', pages: [pageWithMethods] }
    expect(renderScenario(scenario)).toContain('import pages.LoginPage;')
  })

  it('instantiates page objects in the test method and calls them', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [pageWithMethods] }
    const out = renderScenario(scenario)
    expect(out).toContain('LoginPage loginPage = new LoginPage(driver);')
    expect(out).toContain('loginPage.submitForm("foo@bar.com");')
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
      out.indexOf(
        'driver.get(System.getenv().getOrDefault("BASE_URL", "http://localhost:4500") + "/login");',
      ),
    ).toBeGreaterThan(-1)
    expect(out.indexOf('driver.get(')).toBeLessThan(out.indexOf('loginPage.'))
  })

  it('declares each inline fill in its own block so repeated _el locals compile', () => {
    const steps: IRPage['steps'] = [
      { id: 'a', action: 'fill', element: emailEl, value: 'one' },
      { id: 'b', action: 'fill', element: emailEl, value: 'two' },
    ]
    const out = renderScenario({ name: 'Twice', pages: [{ ...loginPage, steps }] })
    expect(out.match(/WebElement _el =/g)).toHaveLength(2)
    expect(out.match(/^\s+\{$/gm)).toHaveLength(2)
  })

  it('passes a secret as an environment lookup, never the recorded value', () => {
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
    expect(out).toContain('System.getenv().getOrDefault("RECOSPEC_PASSWORD", "change-me")')
    expect(out).not.toContain('hunter2')
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
