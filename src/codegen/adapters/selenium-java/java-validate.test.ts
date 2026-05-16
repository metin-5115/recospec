import { describe, it, expect } from 'vitest'
import { validateJavaSource } from './java-validate'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { renderScaffold } from './scaffold'
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

function expectValid(source: string, label: string): void {
  const result = validateJavaSource(source)
  if (!result.ok) {
    throw new Error(
      `${label} failed Java validation:\n${result.issues.map((i) => `  line ${i.line}: ${i.message}`).join('\n')}\n--- source ---\n${source}`,
    )
  }
  expect(result.ok).toBe(true)
}

describe('selenium-java — validateJavaSource sanity', () => {
  it('passes balanced braces', () => {
    expect(validateJavaSource('class A { void f() { } }').ok).toBe(true)
  })

  it('rejects unbalanced braces', () => {
    const r = validateJavaSource('class A { void f() { ')
    expect(r.ok).toBe(false)
    expect(r.issues[0].message).toContain('unclosed')
  })

  it('rejects unterminated string literal', () => {
    const r = validateJavaSource(`class A { String s = "hello; }`)
    expect(r.ok).toBe(false)
    expect(r.issues[0].message).toContain('unterminated string')
  })

  it('rejects mismatched bracket types', () => {
    const r = validateJavaSource('class A { void f() { ] }')
    expect(r.ok).toBe(false)
    expect(r.issues[0].message).toMatch(/mismatched|unmatched/)
  })

  it('ignores braces inside line comments', () => {
    expect(validateJavaSource('class A { // }\n}').ok).toBe(true)
  })

  it('ignores braces inside block comments', () => {
    expect(validateJavaSource('class A { /* { */ }').ok).toBe(true)
  })

  it('ignores braces inside string literals with escapes', () => {
    expect(validateJavaSource('class A { String s = "{ \\" }"; }').ok).toBe(true)
  })

  it('ignores braces inside char literals', () => {
    expect(validateJavaSource(`class A { char c = '{'; }`).ok).toBe(true)
  })

  it('rejects unterminated block comment', () => {
    const r = validateJavaSource('class A { /* unterminated')
    expect(r.ok).toBe(false)
    expect(r.issues[0].message).toContain('block comment')
  })
})

describe('selenium-java — generated source passes structural validation', () => {
  it('renderPageObject output is structurally valid Java (login page)', () => {
    expectValid(renderPageObject(loginPage), 'LoginPage')
  })

  it('renderPageObject output is structurally valid Java (page with no inferred methods)', () => {
    const page: IRPage = { ...loginPage, inferredMethods: undefined }
    expectValid(renderPageObject(page), 'LoginPage (performSteps)')
  })

  it('renderScenario output is structurally valid Java', () => {
    const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }
    expectValid(renderScenario(scenario), 'TestLoginFlow.java')
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
    expectValid(renderPageObject(page), 'ExoticPage')
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
    expectValid(renderScenario(scenario), 'empty scenario')
    expectValid(renderPageObject(empty), 'empty page')
  })

  it('handles all assertion types without breaking syntax', () => {
    const page: IRPage = {
      name: 'Asserts',
      className: 'AssertsPage',
      normalizedUrl: '/a',
      elements: [signInEl],
      steps: [
        { id: '1', action: 'navigate', url: '/a' },
        { id: '2', action: 'assert', element: signInEl, assertionDetail: { type: 'visible' } },
        { id: '3', action: 'assert', element: signInEl, assertionDetail: { type: 'hidden' } },
        {
          id: '4',
          action: 'assert',
          element: signInEl,
          assertionDetail: { type: 'text', expected: 'Sign In' },
        },
        {
          id: '5',
          action: 'assert',
          element: signInEl,
          assertionDetail: { type: 'value', expected: 'on' },
        },
        {
          id: '6',
          action: 'assert',
          element: signInEl,
          assertionDetail: { type: 'attribute', attribute: 'data-id', expected: 'btn-1' },
        },
        {
          id: '7',
          action: 'assert',
          element: signInEl,
          assertionDetail: { type: 'count', expected: 1 },
        },
        {
          id: '8',
          action: 'assert',
          element: signInEl,
          assertionDetail: { type: 'screenshot', name: 'home', threshold: 0.05 },
        },
      ],
    }
    expectValid(renderPageObject(page), 'AssertsPage (all assertion types)')
  })
})

describe('selenium-java — scaffold integrity', () => {
  it('emits pom.xml with selenium-java + testng + webdrivermanager', () => {
    const files = renderScaffold()
    const pom = files.find((f) => f.filename === 'pom.xml')!
    expect(pom.content).toContain('<artifactId>selenium-java</artifactId>')
    expect(pom.content).toContain('<artifactId>testng</artifactId>')
    expect(pom.content).toContain('<artifactId>webdrivermanager</artifactId>')
  })

  it('emits testng.xml with the tests package', () => {
    const files = renderScaffold()
    const suite = files.find((f) => f.filename === 'testng.xml')!
    expect(suite.content).toContain('<package name="tests"/>')
  })

  it('emits .gitignore covering target/ and screenshots/', () => {
    const files = renderScaffold()
    const ignore = files.find((f) => f.filename === '.gitignore')!
    expect(ignore.content).toContain('target/')
    expect(ignore.content).toContain('screenshots/')
  })
})
