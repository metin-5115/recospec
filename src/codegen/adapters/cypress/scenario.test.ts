import { describe, it, expect } from 'vitest'
import { renderScenario } from './scenario'
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

describe('cypress renderScenario', () => {
  it('matches snapshot', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expect(renderScenario(scenario)).toMatchSnapshot()
  })

  it('emits describe + it blocks', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    const out = renderScenario(scenario)
    expect(out).toContain(`describe('Login flow', () =>`)
    expect(out).toContain(`it('full flow', () =>`)
  })

  it('emits cy.visit for navigate steps', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    const out = renderScenario(scenario)
    expect(out).toContain(`cy.visit("/login")`)
  })

  it('emits .clear().type(value) for fill steps', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    const out = renderScenario(scenario)
    expect(out).toContain(`.clear().type("foo@bar.com")`)
  })

  it('imports page objects from ../pages/', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    const out = renderScenario(scenario)
    expect(out).toContain(`import { LoginPage } from '../pages/LoginPage';`)
  })

  it('falls back to comment when assert step has no detail', () => {
    const page: IRPage = {
      ...loginPage,
      steps: [{ id: 'x', action: 'assert', annotation: 'manual check' }],
    }
    const scenario: IRScenario = { name: 'Manual', pages: [page] }
    const out = renderScenario(scenario)
    expect(out).toContain('// assert: manual check')
  })
})
