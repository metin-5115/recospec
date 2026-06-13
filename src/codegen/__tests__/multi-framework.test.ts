import { describe, it, expect } from 'vitest'
import '../adapters/playwright-ts'
import '../adapters/cypress'
import '../adapters/selenium-py'
import '../adapters/selenium-java'
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
  it('registers playwright-ts, cypress, selenium-py, and selenium-java adapters', () => {
    const ids = listAdapters().map((a) => a.id)
    expect(ids).toContain('playwright-ts')
    expect(ids).toContain('cypress')
    expect(ids).toContain('selenium-py')
    expect(ids).toContain('selenium-java')
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

  it('selenium-py produces .py files with By.* tuples', () => {
    const adapter = getAdapter('selenium-py')
    const page = adapter.renderPageObject(loginPage)
    const spec = adapter.renderScenario(scenario)
    expect(page.filename).toBe('login_page.py')
    expect(spec.filename).toBe('test_scenario.py')
    expect(page.content).toContain('class LoginPage:')
    expect(page.content).toContain('(By.CSS_SELECTOR,')
    expect(spec.content).toContain('def test_login_flow(driver):')
    expect(spec.content).toContain('from pages.login_page import LoginPage')
  })

  it('selenium-py scaffold includes requirements.txt, conftest.py, pytest.ini', () => {
    const files = getAdapter('selenium-py').renderScaffold()
    const names = files.map((f) => f.filename)
    expect(names).toContain('requirements.txt')
    expect(names).toContain('conftest.py')
    expect(names).toContain('pytest.ini')

    const reqs = files.find((f) => f.filename === 'requirements.txt')!.content
    expect(reqs).toContain('selenium')
    expect(reqs).toContain('pytest')
    expect(reqs).toContain('pytest-html')

    const conftest = files.find((f) => f.filename === 'conftest.py')!.content
    expect(conftest).toContain('def driver(request):')
    expect(conftest).toContain('--headed')
  })

  it('selenium-java produces .java files with @FindBy annotations', () => {
    const adapter = getAdapter('selenium-java')
    const page = adapter.renderPageObject(loginPage)
    const spec = adapter.renderScenario(scenario)
    expect(page.filename).toBe('LoginPage.java')
    expect(spec.filename).toBe('TestLoginFlow.java')
    expect(page.content).toContain('package pages;')
    expect(page.content).toContain('public class LoginPage {')
    expect(page.content).toContain('@FindBy(css = "[data-testid=\\"login-email\\"]")')
    expect(page.content).toContain('PageFactory.initElements(driver, this);')
    expect(spec.content).toContain('package tests;')
    expect(spec.content).toContain('@BeforeMethod')
    expect(spec.content).toContain('@Test')
    expect(spec.content).toContain('@AfterMethod')
    expect(spec.content).toContain('public void loginFlow()')
  })

  it('selenium-java scaffold includes pom.xml and testng.xml', () => {
    const files = getAdapter('selenium-java').renderScaffold()
    const names = files.map((f) => f.filename)
    expect(names).toContain('pom.xml')
    expect(names).toContain('testng.xml')

    const pom = files.find((f) => f.filename === 'pom.xml')!.content
    expect(pom).toContain('<artifactId>selenium-java</artifactId>')
    expect(pom).toContain('<artifactId>testng</artifactId>')

    const suite = files.find((f) => f.filename === 'testng.xml')!.content
    expect(suite).toContain('<suite ')
    expect(suite).toContain('<package name="tests"/>')
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
