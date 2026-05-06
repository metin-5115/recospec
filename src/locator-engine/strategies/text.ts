import type { Locator } from '@shared/types/locator'
import { MAX_TEXT_CONTENT_LENGTH } from '@shared/constants'
import type { LocatorStrategy } from './base'

export class TextStrategy implements LocatorStrategy {
  readonly name = 'text'
  readonly basePriority = 6

  evaluate(el: Element, _doc: Document): Locator | null {
    const raw = el.textContent ?? ''
    const text = raw.replace(/\s+/g, ' ').trim()
    if (!text || text.length > MAX_TEXT_CONTENT_LENGTH) return null

    return {
      strategy: 'text',
      selector: text,
      framework: {
        playwright: `page.getByText(${JSON.stringify(text)}, { exact: true })`,
        cypress: `cy.contains(${JSON.stringify(text)})`,
        seleniumPy: `driver.find_element(By.XPATH, '//*[normalize-space(text())=${JSON.stringify(text)}]')`,
      },
    }
  }
}
