import { describe, it, expect } from 'vitest'
import { renderPageObject, renderScenario, renderScaffold } from './index'
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
  it('matches snapshot', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    const output = renderScenario(scenario)
    expect(output).toContain('import { LoginPage }')
    expect(output).toContain("test.describe('Login flow'")
  })

  it('imports page object', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    const output = renderScenario(scenario)
    expect(output).toContain('import { LoginPage }')
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
      `// Fallbacks: getByLabel("Email"), getByRole('textbox', { name: 'Email' })`,
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
