import { describe, it, expect } from 'vitest'
import { renderPageObject, renderScenario } from './index'
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
  it('omits mocks when includeMocks=false', () => {
    const out = renderPageObject(pageWithLoginAndMock, { includeMocks: false })
    expect(out).not.toContain('page.route(')
    // Inferred login() should still be present
    expect(out).toContain('async login(')
  })

  it('emits page.route fulfill block when includeMocks=true', () => {
    const out = renderPageObject(pageWithLoginAndMock, { includeMocks: true })
    expect(out).toContain('this.page.route("**/login"')
    expect(out).toContain('status: 200')
    expect(out).toContain('contentType: "application/json"')
    // Body is preserved as live JSON, not stringified — with its secrets masked
    expect(out).toContain('JSON.stringify({"token":"***","user":{"id":1}})')
    expect(out).not.toContain('"abc"')
  })

  it('keeps the mock inside the page-object method the spec calls', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [pageWithLoginAndMock] }
    const out = renderScenario(scenario, { includeMocks: true })
    expect(out).toContain('await loginPage.login(')
    expect(out).not.toContain('page.route(')
  })

  it('registers the mock before the click that triggers the request', () => {
    const out = renderPageObject(pageWithLoginAndMock, { includeMocks: true })
    const route = out.indexOf('this.page.route(')
    expect(route).toBeGreaterThan(-1)
    expect(route).toBeLessThan(out.indexOf('.click()'))
  })

  it('registers the mock first in performSteps when no method was inferred', () => {
    const page: IRPage = { ...pageWithLoginAndMock, inferredMethods: undefined }
    const out = renderPageObject(page, { includeMocks: true })
    expect(out).toContain('async performSteps()')
    const route = out.indexOf('this.page.route(')
    expect(route).toBeGreaterThan(-1)
    expect(route).toBeLessThan(out.indexOf('.click()'))
  })

  it('registers the mock before the click in an inlined scenario step list', () => {
    const page: IRPage = { ...pageWithLoginAndMock, inferredMethods: undefined }
    const out = renderScenario({ name: 'Inline', pages: [page] }, { includeMocks: true })
    const route = out.indexOf('page.route(')
    expect(route).toBeGreaterThan(-1)
    expect(route).toBeLessThan(out.indexOf('.click()'))
  })

  it('infers login() with email/password param types', () => {
    const out = renderPageObject(pageWithLoginAndMock, { includeMocks: false })
    expect(out).toMatch(/async login\(email: string, password: string\)/)
  })

  it('matches snapshot with mocks enabled', () => {
    const out = renderPageObject(pageWithLoginAndMock, { includeMocks: true })
    expect(out).toMatchSnapshot()
  })

  it('handles non-JSON responses by quoting body as a string literal', () => {
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
    const out = renderPageObject(textPage, { includeMocks: true })
    expect(out).toContain('contentType: "text/plain"')
    expect(out).toContain('body: "OK"')
  })
})
