import { describe, it, expect } from 'vitest'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
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

describe('cypress adapter — network mocks', () => {
  it('emits nothing when mocks are disabled (default)', () => {
    const scenario: IRScenario = { name: 'Login', pages: [page(steps)] }
    expect(renderScenario(scenario)).not.toContain('cy.intercept')
    expect(renderPageObject(page(steps))).not.toContain('cy.intercept')
  })

  it('renders a method + pathname matcher with a status and JSON body', () => {
    const out = renderPageObject(page(steps), { includeMocks: true })
    expect(out).toContain(`method: 'POST'`)
    expect(out).toContain(`pathname: '/api/login'`)
    expect(out).toContain(`query: { remember: '1' }`)
    expect(out).toContain('statusCode: 201')
    expect(out).toContain(`'content-type': 'application/json'`)
    expect(out).toContain('body: {"token":"***","user":{"id":1}}')
  })

  it('registers the mock BEFORE the inline steps that trigger the request', () => {
    const inline: IRPage = { ...page(steps), inferredMethods: undefined }
    const out = renderScenario({ name: 'Login', pages: [inline] }, { includeMocks: true })
    expect(out.indexOf('cy.intercept')).toBeGreaterThan(-1)
    expect(out.indexOf('cy.intercept')).toBeLessThan(out.indexOf('.click()'))
  })

  it('leaves the mock to the page-object method the spec calls', () => {
    const out = renderScenario({ name: 'Login', pages: [page(steps)] }, { includeMocks: true })
    expect(out).toMatch(/loginPage\.submitForm\(.+\);/)
    expect(out).not.toContain('cy.intercept')
  })

  it('registers the mock first inside the page-object method as well', () => {
    const out = renderPageObject(page(steps), { includeMocks: true })
    expect(out.indexOf('cy.intercept')).toBeGreaterThan(-1)
    expect(out.indexOf('cy.intercept')).toBeLessThan(out.indexOf('.click()'))
  })

  it('renders a non-JSON body as a string literal', () => {
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
    const out = renderPageObject(page([text]), { includeMocks: true })
    expect(out).toContain('body: "ok \\"fine\\""')
  })

  it('falls back to a string body when the JSON is truncated', () => {
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
    const out = renderPageObject(page([truncated]), { includeMocks: true })
    expect(out).toContain('body: "{\\"items\\":[1,2,"')
  })

  it('never writes a secret from the response into the mock', () => {
    const out = renderPageObject(page(steps), { includeMocks: true })
    expect(out).toContain('intercept')
    expect(out).not.toContain('abc')
  })

  it('emits a single intercept for repeated identical requests', () => {
    const dup: IRStep[] = [
      { id: 'a', action: 'network', network: loginNetwork },
      { id: 'b', action: 'network', network: loginNetwork },
    ]
    const out = renderPageObject(page(dup), { includeMocks: true })
    expect(out.match(/cy\.intercept/g)).toHaveLength(1)
  })

  it('skips an unparseable URL instead of emitting a broken matcher', () => {
    const bad: IRStep = {
      id: 'n',
      action: 'network',
      network: { method: 'GET', url: 'not a url', status: 200 },
    }
    const out = renderPageObject(page([bad]), { includeMocks: true })
    expect(out).not.toContain('cy.intercept')
  })
})
