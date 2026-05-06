import type { Locator } from '@shared/types/locator'
import type { LocatorStrategy } from './base'

const DYNAMIC_ID = /^(:[a-z0-9]+|[a-z]+-[0-9]+-[0-9]+|[a-z0-9]{16,}|ember[0-9]+)$/i

export class IdStrategy implements LocatorStrategy {
  readonly name = 'id'
  readonly basePriority = 7

  evaluate(el: Element, _doc: Document): Locator | null {
    const id = el.getAttribute('id')?.trim()
    if (!id || DYNAMIC_ID.test(id)) return null

    const selector = `#${CSS.escape(id)}`
    return {
      strategy: 'id',
      selector,
      framework: {
        playwright: `page.locator(${JSON.stringify(selector)})`,
        cypress: `cy.get(${JSON.stringify(selector)})`,
        seleniumPy: `driver.find_element(By.ID, ${JSON.stringify(id)})`,
      },
    }
  }
}
