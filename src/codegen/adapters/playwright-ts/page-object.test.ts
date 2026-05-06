import { describe, it, expect } from 'vitest'
import { renderPageObject, renderScenario } from './index'
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
    expect(output).toMatchSnapshot()
  })

  it('imports page object', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    const output = renderScenario(scenario)
    expect(output).toContain('import { LoginPage }')
  })
})
