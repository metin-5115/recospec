import { describe, it, expect, beforeEach } from 'vitest'
import { renderPageObject, renderScenario, playwrightTsAdapter } from './index'
import { inferMethods } from '../../planner/method-inferer'
import type { IRPage, IRScenario, IRElement, IRNetworkInfo } from '../../ir/types'

const submitElement: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'testid',
  locatorValue: 'submit-btn',
  tagName: 'button',
}

const emailElement: IRElement = {
  name: 'emailInput',
  locatorStrategy: 'testid',
  locatorValue: 'email',
  tagName: 'input',
  inputType: 'email',
}

const passwordElement: IRElement = {
  name: 'passwordInput',
  locatorStrategy: 'testid',
  locatorValue: 'password',
  tagName: 'input',
  inputType: 'password',
}

const loginNetwork: IRNetworkInfo = {
  method: 'POST',
  url: 'https://api.example.com/login',
  status: 200,
  contentType: 'application/json',
  responseBody: '{"token":"abc","user":{"id":1}}',
}

const loginSteps = [
  { id: 's0', action: 'navigate' as const, url: '/login' },
  { id: 's1', action: 'fill' as const, element: emailElement, value: 'a@b.com' },
  { id: 's2', action: 'fill' as const, element: passwordElement, value: 'p' },
  { id: 's3', action: 'click' as const, element: submitElement },
  { id: 's4', action: 'network' as const, network: loginNetwork },
]

const pageWithLoginAndMock: IRPage = {
  name: 'Login',
  className: 'LoginPage',
  normalizedUrl: '/login',
  elements: [emailElement, passwordElement, submitElement],
  steps: loginSteps,
  inferredMethods: inferMethods(loginSteps),
}

describe('playwright adapter — network mock generation', () => {
  beforeEach(() => {
    // Reset to default off between tests so other suites stay deterministic.
    playwrightTsAdapter.applyOptions?.({ includeMocks: false })
  })

  it('omits mocks when includeMocks=false', () => {
    playwrightTsAdapter.applyOptions?.({ includeMocks: false })
    const out = renderPageObject(pageWithLoginAndMock)
    expect(out).not.toContain('page.route(')
    // Inferred login() should still be present
    expect(out).toContain('async login(')
  })

  it('emits page.route fulfill block when includeMocks=true', () => {
    playwrightTsAdapter.applyOptions?.({ includeMocks: true })
    const out = renderPageObject(pageWithLoginAndMock)
    expect(out).toContain('this.page.route("**/login"')
    expect(out).toContain('status: 200')
    expect(out).toContain('contentType: "application/json"')
    // Body is preserved as live JSON, not stringified
    expect(out).toContain('JSON.stringify({"token":"abc"')
  })

  it('keeps the mock inside the page-object method the spec calls', () => {
    playwrightTsAdapter.applyOptions?.({ includeMocks: true })
    const scenario: IRScenario = { name: 'Login flow', pages: [pageWithLoginAndMock] }
    const out = renderScenario(scenario)
    expect(out).toContain('await loginPage.login(')
    expect(out).not.toContain('page.route(')
  })

  it('infers login() with email/password param types', () => {
    playwrightTsAdapter.applyOptions?.({ includeMocks: false })
    const out = renderPageObject(pageWithLoginAndMock)
    expect(out).toMatch(/async login\(email: string, password: string\)/)
  })

  it('matches snapshot with mocks enabled', () => {
    playwrightTsAdapter.applyOptions?.({ includeMocks: true })
    const out = renderPageObject(pageWithLoginAndMock)
    expect(out).toMatchSnapshot()
  })

  it('handles non-JSON responses by quoting body as a string literal', () => {
    playwrightTsAdapter.applyOptions?.({ includeMocks: true })
    const textSteps = [
      { id: 's0', action: 'navigate' as const, url: '/status' },
      { id: 's1', action: 'click' as const, element: submitElement },
      {
        id: 's2',
        action: 'network' as const,
        network: {
          method: 'GET',
          url: 'https://api.example.com/health',
          status: 200,
          contentType: 'text/plain',
          responseBody: 'OK',
        },
      },
    ]
    const textPage: IRPage = {
      name: 'Status',
      className: 'StatusPage',
      normalizedUrl: '/status',
      elements: [submitElement],
      steps: textSteps,
      inferredMethods: inferMethods(textSteps),
    }
    const out = renderPageObject(textPage)
    expect(out).toContain('contentType: "text/plain"')
    expect(out).toContain('body: "OK"')
  })
})
