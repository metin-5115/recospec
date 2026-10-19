import { describe, it, expect } from 'vitest'
import { renderPageObject, renderScenario, renderScaffold } from './index'
import { inferMethods } from '../../planner/method-inferer'
import type { IRPage, IRScenario, IRElement } from '../../ir/types'

const loginElement: IRElement = {
  name: 'usernameInput',
  locatorStrategy: 'testid',
  locatorValue: 'username-input',
  tagName: 'input',
}

const submitElement: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'testid',
  locatorValue: 'submit-btn',
  tagName: 'button',
}

const loginPage: IRPage = {
  name: 'Login',
  className: 'LoginPage',
  normalizedUrl: '/login',
  elements: [loginElement, submitElement],
  steps: [
    { id: 's1', action: 'navigate', url: '/login' },
    { id: 's2', action: 'fill', element: loginElement, value: 'admin' },
    { id: 's3', action: 'click', element: submitElement },
  ],
}

describe('renderPageObject', () => {
  it('matches snapshot', () => {
    const output = renderPageObject(loginPage)
    expect(output).toMatchSnapshot()
  })

  it('includes class name', () => {
    const output = renderPageObject(loginPage)
    expect(output).toContain('class LoginPage')
  })

  it('renders getByTestId for testid strategy', () => {
    const output = renderPageObject(loginPage)
    expect(output).toContain('getByTestId')
  })

  it('renders fill and click steps', () => {
    const output = renderPageObject(loginPage)
    expect(output).toContain('.fill(')
    expect(output).toContain('.click(')
  })
})

describe('renderScenario', () => {
  const pageWithMethods: IRPage = { ...loginPage, inferredMethods: inferMethods(loginPage.steps) }

  it('matches snapshot', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [pageWithMethods] }
    const output = renderScenario(scenario)
    expect(output).toContain("import { LoginPage } from '../pages/LoginPage'")
    expect(output).toContain("test.describe('Login flow'")
    expect(output).toMatchSnapshot()
  })

  it('imports the page object from pages/ and calls its methods', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [pageWithMethods] }
    const output = renderScenario(scenario)
    expect(output).toContain("import { LoginPage } from '../pages/LoginPage';")
    expect(output).toContain('const loginPage = new LoginPage(page);')
    expect(output).toContain('await loginPage.submitForm("admin");')
  })

  it('opens the start URL before the first call', () => {
    const steps = loginPage.steps.slice(1)
    const scenario: IRScenario = {
      name: 'Login flow',
      startUrl: 'http://localhost:4500/login',
      pages: [{ ...loginPage, steps, inferredMethods: inferMethods(steps) }],
    }
    const output = renderScenario(scenario)
    expect(output.indexOf('await page.goto("/login");')).toBeGreaterThan(-1)
    expect(output.indexOf('page.goto(')).toBeLessThan(output.indexOf('loginPage.submitForm'))
  })

  it('does not import a page whose steps are written inline', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expect(renderScenario(scenario)).not.toContain('import { LoginPage }')
  })
})

describe('renderPageObject — goto', () => {
  it('falls back to the recorded route when no navigate step exists', () => {
    const page: IRPage = { ...loginPage, steps: loginPage.steps.slice(1) }
    expect(renderPageObject(page)).toContain('await this.page.goto("/login");')
  })
})

describe('renderPageObject — fallback comments', () => {
  it('renders idiomatic Playwright fallbacks below the primary getter', () => {
    const elementWithFallbacks: IRElement = {
      name: 'emailInput',
      locatorStrategy: 'testid',
      locatorValue: '[data-testid="email"]',
      tagName: 'input',
      fallbackLocators: [
        { strategy: 'aria-label', locatorValue: '[aria-label="Email"]' },
        { strategy: 'role-name', locatorValue: `'textbox', { name: 'Email' }` },
      ],
    }
    const page: IRPage = {
      name: 'Login',
      className: 'LoginPage',
      normalizedUrl: '/login',
      elements: [elementWithFallbacks],
      steps: [{ id: 's1', action: 'navigate', url: '/login' }],
    }
    const output = renderPageObject(page)
    expect(output).toContain(
      `// Fallbacks: getByLabel("Email"), getByRole("textbox", { name: "Email" })`,
    )
  })

  it('omits the comment line when no fallbacks are present', () => {
    const output = renderPageObject(loginPage)
    expect(output).not.toContain('Fallbacks:')
  })
})

describe('renderScaffold — self-healing helper', () => {
  it('emits utils/locator.ts containing selfHealingLocator', () => {
    const files = renderScaffold()
    const helper = files.find((f) => f.filename === 'utils/locator.ts')
    expect(helper).toBeDefined()
    expect(helper!.content).toContain('export async function selfHealingLocator')
  })
})
