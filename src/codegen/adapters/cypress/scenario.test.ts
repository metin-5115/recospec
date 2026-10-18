import { describe, it, expect } from 'vitest'
import { renderScenario } from './scenario'
import { inferMethods } from '../../planner/method-inferer'
import type { IRPage, IRScenario, IRElement } from '../../ir/types'

// Note: deliberately uses a non-sensitive field name (`usernameInput`) so
// these tests stay focused on scenario-level rendering. Sensitive-field
// auto-detection is exercised in dedicated test-data tests.
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

  it('imports page objects from ../pages/ and calls their methods', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [pageWithMethods] }
    const out = renderScenario(scenario)
    expect(out).toContain(`import { LoginPage } from '../pages/LoginPage';`)
    expect(out).toContain('const loginPage = new LoginPage();')
    expect(out).toContain('loginPage.submitForm("foo@bar.com");')
    expect(out).not.toContain('cy.get(')
  })

  it('opens the start URL before the first call', () => {
    const steps = loginPage.steps.slice(1)
    const scenario: IRScenario = {
      name: 'Login flow',
      startUrl: 'http://localhost:4500/login',
      pages: [{ ...loginPage, steps, inferredMethods: inferMethods(steps) }],
    }
    const out = renderScenario(scenario)
    expect(out.indexOf('cy.visit("http://localhost:4500/login");')).toBeGreaterThan(-1)
    expect(out.indexOf('cy.visit(')).toBeLessThan(out.indexOf('loginPage.'))
  })

  it('does not import a page whose steps are written inline', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expect(renderScenario(scenario)).not.toContain('import { LoginPage }')
  })

  it('passes a secret as a Cypress.env lookup, never the recorded value', () => {
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
    expect(out).toContain('Cypress.env(')
    expect(out).not.toContain('hunter2')
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

  it('emits cy.matchImageSnapshot for screenshot assertions', () => {
    const page: IRPage = {
      ...loginPage,
      steps: [
        { id: 's1', action: 'navigate', url: '/login' },
        {
          id: 's2',
          action: 'assert',
          assertionDetail: { type: 'screenshot', name: 'login', threshold: 0.05 },
        },
      ],
    }
    const scenario: IRScenario = { name: 'Visual flow', pages: [page] }
    const out = renderScenario(scenario)
    expect(out).toContain(
      `cy.matchImageSnapshot("login", { failureThreshold: 0.05, failureThresholdType: 'percent' });`,
    )
  })
})
