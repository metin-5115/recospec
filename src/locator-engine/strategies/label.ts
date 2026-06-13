import type { Locator } from '@shared/types/locator'
import { isDynamicValue } from '@shared/dynamic-value'
import type { LocatorStrategy } from './base'

type LabelMechanism = 'for' | 'wrap'

function findLabel(el: Element, doc: Document): { text: string; mechanism: LabelMechanism } | null {
  const id = el.getAttribute('id')
  if (id) {
    const label = doc.querySelector(`label[for="${CSS.escape(id)}"]`)
    const text = label?.textContent?.trim()
    if (text) return { text, mechanism: 'for' }
  }

  const parentLabel = el.closest('label')
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as Element
    clone.querySelectorAll('input, select, textarea').forEach((c) => c.remove())
    const text = clone.textContent?.trim()
    if (text) return { text, mechanism: 'wrap' }
  }

  return null
}

export class LabelStrategy implements LocatorStrategy {
  readonly name = 'label'
  readonly basePriority = 6

  evaluate(el: Element, doc: Document): Locator | null {
    const found = findLabel(el, doc)
    if (!found) return null

    const { text, mechanism } = found
    const cypressLocator =
      mechanism === 'for'
        ? `cy.get('label').contains(${JSON.stringify(text)}).next('input, select, textarea')`
        : `cy.get('label').contains(${JSON.stringify(text)}).find('input, select, textarea')`

    return {
      strategy: 'label',
      selector: text,
      volatile: isDynamicValue(text),
      framework: {
        playwright: `page.getByLabel(${JSON.stringify(text)})`,
        cypress: cypressLocator,
        seleniumPy: `driver.find_element(By.XPATH, '//label[normalize-space()=${JSON.stringify(text)}]/following::*[self::input or self::select or self::textarea][1]')`,
      },
    }
  }
}
