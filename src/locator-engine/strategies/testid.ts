import type { Locator } from '@shared/types/locator'
import type { LocatorStrategy } from './base'

export class TestIdStrategy implements LocatorStrategy {
  readonly name = 'testid'
  readonly basePriority = 1

  evaluate(el: Element, _doc: Document): Locator | null {
    const hasTestid = el.hasAttribute('data-testid')
    const attrName = hasTestid ? 'data-testid' : 'data-test-id'
    const testid = el.getAttribute(attrName)
    if (!testid) return null

    return {
      strategy: 'testid',
      selector: testid,
      framework: {
        playwright: `page.getByTestId('${testid}')`,
        cypress: `cy.get('[${attrName}="${testid}"]')`,
        seleniumPy: `driver.find_element(By.CSS_SELECTOR, '[${attrName}="${testid}"]')`,
      },
    }
  }
}
