import { describe, it, expect } from 'vitest'
import { renderPageObject } from './page-object'
import type { IRPage, IRElement, InferredMethod } from '../../ir/types'

const emailEl: IRElement = {
  name: 'emailInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="login-email"]',
  tagName: 'input',
}

const passwordEl: IRElement = {
  name: 'passwordInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="login-password"]',
  tagName: 'input',
}

const signInEl: IRElement = {
  name: 'signInButton',
  locatorStrategy: 'role-name',
  locatorValue: `'button', { name: 'Sign In' }`,
  tagName: 'button',
}

const loginMethod: InferredMethod = {
  name: 'login',
  params: ['email', 'password'],
  steps: [
    { id: 'm1', action: 'fill', element: emailEl, value: 'user@example.com' },
    { id: 'm2', action: 'fill', element: passwordEl, value: 'secret' },
    { id: 'm3', action: 'click', element: signInEl },
  ],
}

const loginPage: IRPage = {
  name: 'Login',
  className: 'LoginPage',
  normalizedUrl: '/login',
  elements: [emailEl, passwordEl, signInEl],
  steps: [
    { id: 's1', action: 'navigate', url: '/login' },
    { id: 's2', action: 'fill', element: emailEl, value: 'user@example.com' },
    { id: 's3', action: 'fill', element: passwordEl, value: 'secret' },
    { id: 's4', action: 'click', element: signInEl },
  ],
  inferredMethods: [loginMethod],
}

describe('cypress renderPageObject', () => {
  it('matches snapshot for LoginPage with login() method', () => {
    expect(renderPageObject(loginPage)).toMatchSnapshot()
  })

  it('exports class with the configured className', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain('export class LoginPage')
  })

  it('emits cy.get for testid strategy', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain(`cy.get("[data-testid=\\"login-email\\"]")`)
  })

  it('emits cy.findByRole for role-name strategy', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain("cy.findByRole('button', { name: 'Sign In' })")
  })

  it('emits visit() helper using cy.visit', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain(`cy.visit("/login")`)
    expect(out).toContain('return this;')
  })

  it('renders inferred login(email, password) method', () => {
    const out = renderPageObject(loginPage)
    expect(out).toContain('login(email, password)')
    expect(out).toContain('this.emailInput().clear().type(email)')
    expect(out).toContain('this.passwordInput().clear().type(password)')
    expect(out).toContain('this.signInButton().click()')
  })
})

describe('cypress renderPageObject — fallback', () => {
  it('falls back to performSteps when no inferred methods', () => {
    const page: IRPage = { ...loginPage, inferredMethods: undefined }
    const out = renderPageObject(page)
    expect(out).toContain('performSteps()')
  })
})

describe('cypress renderPageObject — assertions', () => {
  const page: IRPage = {
    name: 'Home',
    className: 'HomePage',
    normalizedUrl: '/',
    elements: [signInEl],
    steps: [
      { id: 'a1', action: 'navigate', url: '/' },
      {
        id: 'a2',
        action: 'assert',
        element: signInEl,
        assertionDetail: { type: 'visible' },
      },
      {
        id: 'a3',
        action: 'assert',
        element: signInEl,
        assertionDetail: { type: 'text', expected: 'Sign In' },
      },
      {
        id: 'a4',
        action: 'assert',
        element: signInEl,
        assertionDetail: { type: 'count', expected: 1 },
      },
    ],
  }

  it('renders should("be.visible")', () => {
    expect(renderPageObject(page)).toContain(`should('be.visible')`)
  })

  it('renders should("have.text", ...)', () => {
    expect(renderPageObject(page)).toContain(`should('have.text', "Sign In")`)
  })

  it('renders should("have.length", n)', () => {
    expect(renderPageObject(page)).toContain(`should('have.length', 1)`)
  })
})
