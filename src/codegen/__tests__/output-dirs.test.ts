import { describe, it, expect } from 'vitest'
import '../adapters/playwright-ts'
import '../adapters/cypress'
import '../adapters/selenium-py'
import '../adapters/selenium-java'
import { getAdapter } from '../adapters/registry'
import { resolveOutputPath } from '../export/output-path'
import type { OutputDirOverrides } from '../export/output-layout'
import type { FrameworkId } from '@shared/types/generated'
import type { IRElement, IRPage, IRScenario } from '../ir/types'
import { inferMethods } from '../planner/method-inferer'

const emailEl: IRElement = {
  name: 'emailInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="email"]',
  tagName: 'input',
}
const submitEl: IRElement = {
  name: 'submitBtn',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="submit"]',
  tagName: 'button',
}
const steps: IRPage['steps'] = [
  { id: '1', action: 'fill', element: emailEl, value: 'a@b.co' },
  { id: '2', action: 'click', element: submitEl },
]
const loginPage: IRPage = {
  name: 'Login',
  className: 'LoginPage',
  normalizedUrl: '/login',
  elements: [emailEl, submitEl],
  steps,
  inferredMethods: inferMethods(steps),
}
const scenario: IRScenario = { name: 'Login flow', pages: [loginPage] }

describe('resolveOutputPath with configured folders', () => {
  const dirs: OutputDirOverrides = {
    pagesDir: 'e2e/pages',
    testsDir: 'e2e/specs',
    featuresDir: 'e2e/features',
  }

  it.each([
    ['playwright-ts', 'LoginPage.ts', 'e2e/pages/LoginPage.ts'],
    ['playwright-ts', 'login.spec.ts', 'e2e/specs/login.spec.ts'],
    ['playwright-ts', 'login.feature', 'e2e/features/login.feature'],
    ['playwright-ts', 'login.steps.ts', 'e2e/features/steps/login.steps.ts'],
    ['cypress', 'LoginPage.js', 'e2e/pages/LoginPage.js'],
    ['cypress', 'login.cy.js', 'e2e/specs/login.cy.js'],
    ['cypress', 'login.feature', 'e2e/features/login.feature'],
    ['cypress', 'login.steps.js', 'e2e/features/login/login.steps.js'],
    ['selenium-py', 'login_page.py', 'e2e/pages/login_page.py'],
    ['selenium-py', 'test_login.py', 'e2e/specs/test_login.py'],
    ['selenium-py', 'login.feature', 'e2e/features/login.feature'],
  ] as const)('routes %s %s to %s', (framework, filename, expected) => {
    expect(resolveOutputPath(filename, framework, dirs)).toBe(expected)
  })

  it('leaves config files at the project root', () => {
    expect(resolveOutputPath('playwright.config.ts', 'playwright-ts', dirs)).toBe(
      'playwright.config.ts',
    )
  })

  it('keeps the standard layout for folders that were not configured', () => {
    expect(resolveOutputPath('login.spec.ts', 'playwright-ts', { pagesDir: 'po' })).toBe(
      'tests/login.spec.ts',
    )
  })

  it('maps Java folders under the source roots', () => {
    const java = {
      pagesDir: 'src/main/java/com/acme/pages',
      testsDir: 'src/test/java/com/acme/tests',
    }
    expect(resolveOutputPath('LoginPage.java', 'selenium-java', java)).toBe(
      'src/main/java/com/acme/pages/LoginPage.java',
    )
    expect(resolveOutputPath('LoginFlowTest.java', 'selenium-java', java)).toBe(
      'src/test/java/com/acme/tests/LoginFlowTest.java',
    )
  })
})

describe('generated imports follow the configured folders', () => {
  const render = (framework: FrameworkId, dirs?: OutputDirOverrides) =>
    getAdapter(framework).renderScenario(scenario, { dirs }).content

  it('Playwright spec imports page objects from wherever they were written', () => {
    expect(render('playwright-ts')).toContain(`from '../pages/LoginPage'`)
    expect(render('playwright-ts', { testsDir: 'e2e/specs', pagesDir: 'e2e/pages' })).toContain(
      `from '../pages/LoginPage'`,
    )
    expect(render('playwright-ts', { testsDir: 'tests/e2e', pagesDir: 'pages' })).toContain(
      `from '../../pages/LoginPage'`,
    )
    expect(render('playwright-ts', { testsDir: 'e2e', pagesDir: 'e2e/po' })).toContain(
      `from './po/LoginPage'`,
    )
  })

  it('Cypress spec imports page objects from wherever they were written', () => {
    expect(render('cypress')).toContain(`from '../pages/LoginPage'`)
    expect(render('cypress', { testsDir: 'cy/specs/smoke', pagesDir: 'cy/pages' })).toContain(
      `from '../../pages/LoginPage'`,
    )
  })

  it('Selenium Python test imports page objects by their dotted folder', () => {
    expect(render('selenium-py')).toContain('from pages.login_page import LoginPage')
    expect(render('selenium-py', { pagesDir: 'src/app/pages' })).toContain(
      'from src.app.pages.login_page import LoginPage',
    )
  })

  it('Selenium Java derives package declarations and imports from the folders', () => {
    const dirs = {
      pagesDir: 'src/main/java/com/acme/pages',
      testsDir: 'src/test/java/com/acme/tests',
    }
    const adapter = getAdapter('selenium-java')
    const spec = adapter.renderScenario(scenario, { dirs }).content
    const page = adapter.renderPageObject(loginPage, { dirs }).content
    expect(spec).toContain('package com.acme.tests;')
    expect(spec).toContain('import com.acme.pages.LoginPage;')
    expect(page).toContain('package com.acme.pages;')
  })

  it('Selenium Java rejects a folder outside the Maven source roots', () => {
    expect(() =>
      getAdapter('selenium-java').renderScenario(scenario, { dirs: { pagesDir: 'app/pages' } }),
    ).toThrow(/src\/main\/java/)
  })

  it('BDD step files import page objects from the configured folder', () => {
    const dirs = { pagesDir: 'po', featuresDir: 'bdd' }
    const pw = getAdapter('playwright-ts').renderBddSteps?.(scenario, { dirs })
    expect(pw?.content).toContain(`from '../../po/LoginPage'`)
    const cy = getAdapter('cypress').renderBddSteps?.(scenario, { dirs })
    expect(cy?.content).toContain(`from '../../po/LoginPage'`)
    const py = getAdapter('selenium-py').renderBddSteps?.(scenario, { dirs: { pagesDir: 'po' } })
    expect(py?.content).toContain('from po.login_page import LoginPage')
  })

  it('pytest-bdd finds the feature relative to the configured tests folder', () => {
    const steps = getAdapter('selenium-py').renderBddSteps?.(scenario, {
      dirs: { testsDir: 'qa/tests', featuresDir: 'qa/features' },
    })
    expect(steps?.content).toContain(`scenarios('../features/login-flow.feature')`)
  })
})
