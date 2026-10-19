import { describe, it, expect } from 'vitest'
import '../adapters/playwright-ts'
import '../adapters/cypress'
import '../adapters/selenium-py'
import '../adapters/selenium-java'
import { getAdapter } from '../adapters/registry'
import { resolveOutputPath } from '../export/output-path'
import type { FrameworkId } from '@shared/types/generated'
import type { IRScenario } from '../ir/types'

function flow(name: string): IRScenario {
  return { name, pages: [] }
}

const SPEC_NAMES: [FrameworkId, string, string][] = [
  ['playwright-ts', 'Login With Valid User', 'login-with-valid-user.spec.ts'],
  ['cypress', 'Login With Valid User', 'login-with-valid-user.cy.js'],
  ['selenium-py', 'Login With Valid User', 'test_login_with_valid_user.py'],
  ['selenium-java', 'Login With Valid User', 'LoginWithValidUserTest.java'],
]

describe('spec file names follow the flow', () => {
  it.each(SPEC_NAMES)('%s names the spec after "%s"', (framework, name, expected) => {
    expect(getAdapter(framework).renderScenario(flow(name)).filename).toBe(expected)
  })

  it.each(['playwright-ts', 'cypress', 'selenium-py', 'selenium-java'] as const)(
    '%s writes two different flows to two different files',
    (framework) => {
      const adapter = getAdapter(framework)
      const login = adapter.renderScenario(flow('Login')).filename
      const checkout = adapter.renderScenario(flow('Checkout')).filename
      expect(login).not.toBe(checkout)
    },
  )

  it('Java declares the class that matches its file name', () => {
    const file = getAdapter('selenium-java').renderScenario(flow('Checkout flow'))
    expect(file.filename).toBe('CheckoutFlowTest.java')
    expect(file.content).toContain('public class CheckoutFlowTest {')
  })

  it('Java keeps a flow that starts with a digit a legal identifier', () => {
    const file = getAdapter('selenium-java').renderScenario(flow('2FA login'))
    const className = file.filename.replace(/\.java$/, '')
    expect(className).toMatch(/^[A-Za-z_]\w*$/)
    expect(file.content).toContain(`public class ${className} {`)
  })
})

describe('BDD files follow the flow', () => {
  it.each([
    ['playwright-ts', 'checkout.feature', 'checkout.steps.ts'],
    ['cypress', 'checkout.feature', 'checkout.steps.js'],
    ['selenium-py', 'checkout.feature', 'test_checkout.py'],
  ] as const)('%s emits %s and %s', (framework, feature, steps) => {
    const adapter = getAdapter(framework)
    expect(adapter.renderBddFeature?.(flow('Checkout')).filename).toBe(feature)
    expect(adapter.renderBddSteps?.(flow('Checkout')).filename).toBe(steps)
  })

  it('pytest-bdd points at the feature it was generated with', () => {
    const steps = getAdapter('selenium-py').renderBddSteps?.(flow('Checkout'))
    expect(steps?.content).toContain(`scenarios('../features/checkout.feature')`)
  })
})

describe('Playwright visual baselines follow the spec', () => {
  it('keeps snapshots next to the flow spec, not a shared scenario.spec.ts', () => {
    const files = getAdapter('playwright-ts').renderScaffold({ flowSlug: 'checkout' })
    const names = files.map((f) => f.filename)
    expect(names).toContain('tests/checkout.spec.ts-snapshots/.gitkeep')
    expect(names.some((n) => n.includes('scenario.spec.ts'))).toBe(false)
  })
})

describe('output routing', () => {
  it.each([
    ['playwright-ts', 'login.spec.ts', 'tests/login.spec.ts'],
    ['cypress', 'login.cy.js', 'cypress/e2e/login.cy.js'],
    ['selenium-py', 'test_login.py', 'tests/test_login.py'],
    ['selenium-java', 'LoginTest.java', 'src/test/java/tests/LoginTest.java'],
    ['selenium-java', 'LoginPage.java', 'src/main/java/pages/LoginPage.java'],
    ['selenium-java', 'TestPage.java', 'src/main/java/pages/TestPage.java'],
  ] as const)('routes %s %s to %s', (framework, filename, expected) => {
    expect(resolveOutputPath(filename, framework)).toBe(expected)
  })
})
