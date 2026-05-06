import type { Locator } from '@shared/types/locator'
import type { LocatorStrategy } from './base'

export class AriaLabelStrategy implements LocatorStrategy {
  readonly name = 'aria-label'
  readonly basePriority = 3

  evaluate(el: Element, _doc: Document): Locator | null {
    const label = el.getAttribute('aria-label')?.trim()
    if (!label) return null

    const selector = `[aria-label="${label}"]`
    return {
      strategy: 'aria-label',
      selector,
      framework: {
        playwright: `page.getByLabel(${JSON.stringify(label)})`,
        cypress: `cy.get(${JSON.stringify(selector)})`,
        seleniumPy: `driver.find_element(By.CSS_SELECTOR, ${JSON.stringify(selector)})`,
      },
    }
  }
}
