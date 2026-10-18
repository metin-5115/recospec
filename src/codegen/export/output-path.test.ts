import { describe, it, expect } from 'vitest'
import { resolveOutputPath } from './output-path'

describe('resolveOutputPath', () => {
  it.each([
    ['playwright-ts', 'ShopPage.ts', 'pages/ShopPage.ts'],
    ['playwright-ts', 'scenario.spec.ts', 'tests/scenario.spec.ts'],
    ['playwright-ts', 'playwright.config.ts', 'playwright.config.ts'],
    ['playwright-ts', 'checkout.feature', 'features/checkout.feature'],
    ['playwright-ts', 'checkout.steps.ts', 'features/steps/checkout.steps.ts'],
    ['cypress', 'ShopPage.js', 'cypress/pages/ShopPage.js'],
    ['cypress', 'scenario.cy.js', 'cypress/e2e/scenario.cy.js'],
    ['cypress', 'checkout.steps.js', 'cypress/e2e/checkout/checkout.steps.js'],
    ['selenium-py', 'shop_page.py', 'pages/shop_page.py'],
    ['selenium-py', 'test_scenario.py', 'tests/test_scenario.py'],
    ['selenium-py', 'conftest.py', 'conftest.py'],
    ['selenium-java', 'ShopPage.java', 'src/main/java/pages/ShopPage.java'],
    ['selenium-java', 'TestCheckoutFlow.java', 'src/test/java/tests/TestCheckoutFlow.java'],
    ['selenium-java', 'pom.xml', 'pom.xml'],
    ['cypress', 'cypress/support/e2e.js', 'cypress/support/e2e.js'],
  ] as const)('routes %s %s to %s', (framework, filename, expected) => {
    expect(resolveOutputPath(filename, framework)).toBe(expected)
  })
})
