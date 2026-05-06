import type { Locator } from '@shared/types/locator'
import type { LocatorStrategy } from './base'

const TEST_ATTRIBUTES = ['data-test', 'data-cy', 'data-qa', 'data-automation'] as const

export class TestAttributesStrategy implements LocatorStrategy {
  readonly name = 'test-attr'
  readonly basePriority = 2

  evaluate(el: Element, _doc: Document): Locator | null {
    for (const attr of TEST_ATTRIBUTES) {
      const value = el.getAttribute(attr)?.trim()
      if (value) {
        const selector = `[${attr}="${value}"]`
        return {
          strategy: 'test-attr',
          selector,
          framework: {
            playwright: `page.locator(${JSON.stringify(selector)})`,
            cypress: `cy.get(${JSON.stringify(selector)})`,
            seleniumPy: `driver.find_element(By.CSS_SELECTOR, ${JSON.stringify(selector)})`,
          },
        }
      }
    }
    return null
  }
}
