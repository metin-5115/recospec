import type { Locator } from '@shared/types/locator'
import type { LocatorStrategy } from './base'
import { cssAttrValue, jsSingleQuoted } from '@shared/selector-escape'

const TESTID_ATTRIBUTES = ['data-testid', 'data-test-id', 'data-cy'] as const

export class TestIdStrategy implements LocatorStrategy {
  readonly name = 'testid'
  readonly basePriority = 1

  evaluate(el: Element, _doc: Document): Locator | null {
    for (const attr of TESTID_ATTRIBUTES) {
      const value = el.getAttribute(attr)?.trim()
      if (!value) continue

      const css = jsSingleQuoted(`[${attr}="${cssAttrValue(value)}"]`)
      const playwright =
        attr === 'data-testid'
          ? `page.getByTestId(${jsSingleQuoted(value)})`
          : `page.locator(${css})`

      return {
        strategy: 'testid',
        selector: value,
        framework: {
          playwright,
          cypress: `cy.get(${css})`,
          seleniumPy: `driver.find_element(By.CSS_SELECTOR, ${css})`,
        },
      }
    }
    return null
  }
}
