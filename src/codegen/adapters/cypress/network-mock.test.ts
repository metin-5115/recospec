import { describe, it, expect, beforeEach } from 'vitest'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { cypressAdapter } from './index'
import { inferMethods } from '../../planner/method-inferer'
import type { IRElement, IRNetworkInfo, IRPage, IRScenario, IRStep } from '../../ir/types'

const email: IRElement = {
  name: 'emailInput',
  locatorStrategy: 'testid',
  locatorValue: 'email',
  tagName: 'input',
  inputType: 'email',
}
const submit: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'testid',
  locatorValue: 'submit-btn',
  tagName: 'button',
}

const loginNetwork: IRNetworkInfo = {
  method: 'POST',
  url: 'https://api.example.com/api/login?remember=1',
  status: 201,
  contentType: 'application/json',
  responseBody: '{"token":"abc","user":{"id":1}}',
}

function page(steps: IRStep[]): IRPage {
  return {
    name: 'Login',
    className: 'LoginPage',
    normalizedUrl: '/login',
    elements: [email, submit],
    steps: [{ id: 'nav', action: 'navigate', url: '/login' }, ...steps],
    inferredMethods: inferMethods(steps),
  }
}

const steps: IRStep[] = [
  { id: 's1', action: 'fill', element: email, value: 'a@b.com' },
  { id: 's2', action: 'click', element: submit },
  { id: 's3', action: 'network', network: loginNetwork },
]

beforeEach(() => {
  cypressAdapter.applyOptions?.({ includeMocks: false })
})

describe('cypress adapter — network mocks', () => {
  it('emits nothing when mocks are disabled (default)', () => {
    const scenario: IRScenario = { name: 'Login', pages: [page(steps)] }
    expect(renderScenario(scenario)).not.toContain('cy.intercept')
    expect(renderPageObject(page(steps))).not.toContain('cy.intercept')
  })

  it('renders a method + pathname matcher with a status and JSON body', () => {
    cypressAdapter.applyOptions?.({ includeMocks: true })
    const out = renderPageObject(page(steps))
    expect(out).toContain(`method: 'POST'`)
    expect(out).toContain(`pathname: '/api/login'`)
    expect(out).toContain(`query: { remember: '1' }`)
    expect(out).toContain('statusCode: 201')
    expect(out).toContain(`'content-type': 'application/json'`)
    expect(out).toContain('body: {"token":"abc","user":{"id":1}}')
  })

  it('registers the mock BEFORE the inline steps that trigger the request', () => {
    cypressAdapter.applyOptions?.({ includeMocks: true })
    const inline: IRPage = { ...page(steps), inferredMethods: undefined }
    const out = renderScenario({ name: 'Login', pages: [inline] })
    expect(out.indexOf('cy.intercept')).toBeGreaterThan(-1)
    expect(out.indexOf('cy.intercept')).toBeLessThan(out.indexOf('.click()'))
  })

  it('leaves the mock to the page-object method the spec calls', () => {
    cypressAdapter.applyOptions?.({ includeMocks: true })
    const out = renderScenario({ name: 'Login', pages: [page(steps)] })
    expect(out).toMatch(/loginPage\.submitForm\(.+\);/)
    expect(out).not.toContain('cy.intercept')
  })

  it('registers the mock first inside the page-object method as well', () => {
    cypressAdapter.applyOptions?.({ includeMocks: true })
    const out = renderPageObject(page(steps))
    expect(out.indexOf('cy.intercept')).toBeGreaterThan(-1)
    expect(out.indexOf('cy.intercept')).toBeLessThan(out.indexOf('.click()'))
  })

  it('renders a non-JSON body as a string literal', () => {
    cypressAdapter.applyOptions?.({ includeMocks: true })
    const text: IRStep = {
      id: 'n',
      action: 'network',
      network: {
        method: 'GET',
        url: 'https://x.test/health',
        status: 200,
        contentType: 'text/plain',
        responseBody: 'ok "fine"',
      },
    }
    const out = renderPageObject(page([text]))
    expect(out).toContain('body: "ok \\"fine\\""')
  })

  it('falls back to a string body when the JSON is truncated', () => {
    cypressAdapter.applyOptions?.({ includeMocks: true })
    const truncated: IRStep = {
      id: 'n',
      action: 'network',
      network: {
        method: 'GET',
        url: 'https://x.test/items',
        status: 200,
        contentType: 'application/json',
        responseBody: '{"items":[1,2,',
      },
    }
    const out = renderPageObject(page([truncated]))
    expect(out).toContain('body: "{\\"items\\":[1,2,"')
  })

  it('emits a single intercept for repeated identical requests', () => {
    cypressAdapter.applyOptions?.({ includeMocks: true })
    const dup: IRStep[] = [
      { id: 'a', action: 'network', network: loginNetwork },
      { id: 'b', action: 'network', network: loginNetwork },
    ]
    const out = renderPageObject(page(dup))
    expect(out.match(/cy\.intercept/g)).toHaveLength(1)
  })

  it('skips an unparseable URL instead of emitting a broken matcher', () => {
    cypressAdapter.applyOptions?.({ includeMocks: true })
    const bad: IRStep = {
      id: 'n',
      action: 'network',
      network: { method: 'GET', url: 'not a url', status: 200 },
    }
    const out = renderPageObject(page([bad]))
    expect(out).not.toContain('cy.intercept')
  })
})
