import type { Locator } from '@shared/types/locator'
import type { LocatorStrategy } from './base'

export class AriaLabelStrategy implements LocatorStrategy {
  readonly name = 'aria-label'
  readonly basePriority = 3

  evaluate(el: Element, doc: Document): Locator | null {
    const labelledBy = el.getAttribute('aria-labelledby')?.trim()
    if (labelledBy) {
      const texts = labelledBy
        .split(/\s+/)
        .map((id) => doc.getElementById(id)?.textContent?.trim())
        .filter((t): t is string => Boolean(t))
      if (texts.length > 0) {
        const label = texts.join(' ')
        const selector = `[aria-labelledby="${labelledBy}"]`
        return {
          strategy: 'aria-labelledby',
          selector,
          framework: {
            playwright: `page.getByLabel(${JSON.stringify(label)})`,
            cypress: `cy.get(${JSON.stringify(selector)})`,
            seleniumPy: `driver.find_element(By.CSS_SELECTOR, ${JSON.stringify(selector)})`,
          },
        }
      }
    }

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
