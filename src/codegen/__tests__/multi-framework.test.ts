import { describe, it, expect } from 'vitest'
import '../adapters/playwright-ts'
import '../adapters/cypress'
import { getAdapter, listAdapters } from '../adapters/registry'
import type { IRPage, IRScenario, IRElement } from '../ir/types'

const emailEl: IRElement = {
  name: 'emailInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="login-email"]',
  tagName: 'input',
}

const submitEl: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'role-name',
  locatorValue: `'button', { name: 'Sign In' }`,
  tagName: 'button',
}

const loginPage: IRPage = {
  name: 'Login',
  className: 'LoginPage',
  normalizedUrl: '/login',
  elements: [emailEl, submitEl],
  steps: [
    { id: 's1', action: 'navigate', url: '/login' },
    { id: 's2', action: 'fill', element: emailEl, value: 'admin@example.com' },
    { id: 's3', action: 'click', element: submitEl },
  ],
}

const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }

describe('adapter registry', () => {
  it('registers both playwright-ts and cypress adapters', () => {
    const ids = listAdapters().map((a) => a.id)
    expect(ids).toContain('playwright-ts')
    expect(ids).toContain('cypress')
  })

  it('throws for unknown framework', () => {
    expect(() => getAdapter('unknown' as never)).toThrow()
  })
})

describe('same IR → different framework outputs', () => {
  it('playwright produces .ts files with @playwright/test imports', () => {
    const adapter = getAdapter('playwright-ts')
    const page = adapter.renderPageObject(loginPage)
    const spec = adapter.renderScenario(scenario)
    expect(page.filename).toBe('LoginPage.ts')
    expect(spec.filename).toBe('scenario.spec.ts')
    expect(page.content).toContain(`from '@playwright/test'`)
    expect(spec.content).toContain(`from '@playwright/test'`)
  })

  it('cypress produces .js files with cy.* commands', () => {
    const adapter = getAdapter('cypress')
    const page = adapter.renderPageObject(loginPage)
    const spec = adapter.renderScenario(scenario)
    expect(page.filename).toBe('LoginPage.js')
    expect(spec.filename).toBe('scenario.cy.js')
    expect(page.content).toContain('cy.get(')
    expect(spec.content).toContain('cy.visit(')
    expect(spec.content).not.toContain(`from '@playwright/test'`)
  })

  it('cypress and playwright outputs differ for the same IR', () => {
    const playwrightOut = getAdapter('playwright-ts').renderScenario(scenario).content
    const cypressOut = getAdapter('cypress').renderScenario(scenario).content
    expect(playwrightOut).not.toBe(cypressOut)
    expect(playwrightOut).toContain('test.describe')
    expect(cypressOut).toContain('describe(')
    expect(cypressOut).not.toContain('test.describe')
  })
})

// ---------------------------------------------------------------------------
// Compile validation: parse generated Cypress JS with `new Function` to confirm syntax
// ---------------------------------------------------------------------------

function assertValidJs(src: string, label: string) {
  try {
    // ES modules can't be parsed via new Function; strip imports first.
    const stripped = src.replace(/^import .*?;?$/gm, '').replace(/^export\s+/gm, '')
    new Function(stripped)
  } catch (err) {
    throw new Error(
      `${label} is not valid JS: ${err instanceof Error ? err.message : String(err)}\n--- source ---\n${src}`,
      { cause: err },
    )
  }
}

describe('cypress output — syntax validation', () => {
  it('renderPageObject emits parseable JavaScript', () => {
    const out = getAdapter('cypress').renderPageObject(loginPage).content
    assertValidJs(out, 'cypress page object')
  })

  it('renderScenario emits parseable JavaScript', () => {
    const out = getAdapter('cypress').renderScenario(scenario).content
    assertValidJs(out, 'cypress scenario')
  })

  it('renderScaffold package.json is valid JSON', () => {
    const files = getAdapter('cypress').renderScaffold()
    const pkg = files.find((f) => f.filename === 'package.json')
    expect(pkg).toBeDefined()
    expect(() => JSON.parse(pkg!.content)).not.toThrow()
    const parsed = JSON.parse(pkg!.content)
    expect(parsed.devDependencies.cypress).toBeDefined()
  })

  it('renderScaffold includes cypress.config.js and support file', () => {
    const files = getAdapter('cypress').renderScaffold()
    const names = files.map((f) => f.filename)
    expect(names).toContain('cypress.config.js')
    expect(names).toContain('cypress/support/e2e.js')
  })

  it('renderScaffold ships the cy.selfHealing helper in cypress/support/locator.js', () => {
    const files = getAdapter('cypress').renderScaffold()
    const helper = files.find((f) => f.filename === 'cypress/support/locator.js')
    expect(helper).toBeDefined()
    expect(helper!.content).toContain("Cypress.Commands.add('selfHealing'")

    const e2e = files.find((f) => f.filename === 'cypress/support/e2e.js')
    expect(e2e!.content).toContain("import './locator'")
  })
})
