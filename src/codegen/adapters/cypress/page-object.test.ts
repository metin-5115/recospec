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
    expect(out).toContain('cy.findByRole("button", { name: "Sign In" })')
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

describe('cypress renderPageObject — fallback comments', () => {
  it('renders idiomatic Cypress fallbacks below the primary getter', () => {
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
      `// Fallbacks: cy.findByLabelText("Email"), cy.findByRole("textbox", { name: "Email" })`,
    )
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
        id: 'a3b',
        action: 'assert',
        element: signInEl,
        assertionDetail: { type: 'text-contains', expected: 'Sign' },
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

  it('renders should("contain.text", ...) for text-contains', () => {
    expect(renderPageObject(page)).toContain(`should('contain.text', "Sign")`)
  })

  it('renders should("have.length", n)', () => {
    expect(renderPageObject(page)).toContain(`should('have.length', 1)`)
  })
})

describe('cypress renderPageObject — screenshot', () => {
  it('renders cy.matchImageSnapshot for screenshot assertion', () => {
    const page: IRPage = {
      name: 'Home',
      className: 'HomePage',
      normalizedUrl: '/',
      elements: [],
      steps: [
        { id: 's1', action: 'navigate', url: '/' },
        {
          id: 's2',
          action: 'assert',
          assertionDetail: { type: 'screenshot', name: 'home', threshold: 0.05 },
        },
      ],
    }
    const out = renderPageObject(page)
    expect(out).toContain(
      `cy.matchImageSnapshot("home", { failureThreshold: 0.05, failureThresholdType: 'percent' });`,
    )
  })
})

describe('assertion codegen — dynamic value modes', () => {
  const pattern = '\\d+ TRY'
  const dynPage: IRPage = {
    name: 'Hotels',
    className: 'HotelsPage',
    normalizedUrl: '/',
    elements: [emailEl],
    steps: [
      { id: 'd1', action: 'assert', element: emailEl, assertionDetail: { type: 'not-empty' } },
      {
        id: 'd2',
        action: 'assert',
        element: emailEl,
        assertionDetail: { type: 'matches', expected: pattern },
      },
    ],
  }

  it('renders not.be.empty for not-empty', () => {
    expect(renderPageObject(dynPage)).toContain(".invoke('text').should('not.be.empty');")
  })

  it('renders should(match, RegExp) for matches', () => {
    expect(renderPageObject(dynPage)).toContain(
      `.invoke('text').should('match', new RegExp(${JSON.stringify(pattern)}));`,
    )
  })
})
