import { describe, it, expect } from 'vitest'
import { validatePythonSource } from './python-validate'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import type { IRElement, IRPage, IRScenario, InferredMethod } from '../../ir/types'

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
    { id: 's2', action: 'fill', element: emailEl, value: 'qa@example.com' },
    { id: 's3', action: 'fill', element: passwordEl, value: 'secret123' },
    { id: 's4', action: 'click', element: signInEl },
    {
      id: 's5',
      action: 'assert',
      element: signInEl,
      assertionDetail: { type: 'visible' },
    },
  ],
  inferredMethods: [loginMethod],
}

function expectParsed(source: string, label: string): void {
  const result = validatePythonSource(source)
  if (result.skipped) {
    // No Python interpreter on this machine — skip but keep the test green.
    return
  }
  if (!result.ok) {
    throw new Error(`${label} failed Python AST parse:\n${result.error}\n--- source ---\n${source}`)
  }
  expect(result.ok).toBe(true)
}

describe('selenium-py — Python syntax validation', () => {
  it('rejects deliberately broken Python (sanity check)', () => {
    const result = validatePythonSource('def broken(:\n    pass')
    if (result.skipped) return
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('renderPageObject output is valid Python (login page)', () => {
    expectParsed(renderPageObject(loginPage), 'LoginPage')
  })

  it('renderPageObject output is valid Python (page with no inferred methods)', () => {
    const page: IRPage = { ...loginPage, inferredMethods: undefined }
    expectParsed(renderPageObject(page), 'LoginPage (perform_steps)')
  })

  it('renderScenario output is valid Python', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expectParsed(renderScenario(scenario), 'test_scenario.py')
  })

  it('handles iframes and shadow DOM warnings without breaking syntax', () => {
    const exoticEl: IRElement = {
      name: 'foo',
      locatorStrategy: 'css',
      locatorValue: '.foo',
      tagName: 'div',
      shadowClosed: true,
      frameContext: { frameChain: ['iframe[name="inner"]'] },
    }
    const page: IRPage = {
      name: 'Exotic',
      className: 'ExoticPage',
      normalizedUrl: '/exotic',
      elements: [exoticEl],
      steps: [{ id: '1', action: 'navigate', url: '/exotic' }],
    }
    expectParsed(renderPageObject(page), 'ExoticPage')
  })

  it('handles empty scenario', () => {
    const empty: IRPage = {
      name: 'Empty',
      className: 'EmptyPage',
      normalizedUrl: '/',
      elements: [],
      steps: [],
    }
    const scenario: IRScenario = { name: 'empty', pages: [empty] }
    expectParsed(renderScenario(scenario), 'empty scenario')
    expectParsed(renderPageObject(empty), 'empty page')
  })
})
