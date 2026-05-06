import type { Locator } from '@shared/types/locator'
import type { LocatorStrategy } from './base'
import { isDynamicId } from '../scoring/dynamic-detector'

function buildXPath(el: Element, doc: Document): { xpath: string; isAbsolute: boolean } {
  const tag = el.tagName.toLowerCase()

  const name = el.getAttribute('name')?.trim()
  const placeholder = el.getAttribute('placeholder')?.trim()
  if (name) return { xpath: `//${tag}[@name=${JSON.stringify(name)}]`, isAbsolute: false }
  if (placeholder)
    return { xpath: `//${tag}[@placeholder=${JSON.stringify(placeholder)}]`, isAbsolute: false }

  const segments: string[] = []
  let current: Element | null = el

  while (current && current !== doc.documentElement && current !== doc.body) {
    const parentEl: Element | null = current.parentElement
    if (!parentEl) break

    const t = current.tagName.toLowerCase()
    const siblings = Array.from<Element>(parentEl.children).filter(
      (sibling) => sibling.tagName === current!.tagName,
    )
    const segment = siblings.length > 1 ? `${t}[${siblings.indexOf(current) + 1}]` : t
    segments.unshift(segment)

    const parentId = parentEl.getAttribute('id')
    if (parentId && !isDynamicId(parentId)) {
      return {
        xpath: `//*[@id="${parentId}"]/${segments.join('/')}`,
        isAbsolute: false,
      }
    }

    current = parentEl
  }

  return { xpath: `//${segments.join('/')}`, isAbsolute: true }
}

export class XPathStrategy implements LocatorStrategy {
  readonly name = 'xpath'
  readonly basePriority = 9

  evaluate(el: Element, doc: Document): Locator | null {
    const { xpath, isAbsolute } = buildXPath(el, doc)
    return {
      strategy: 'xpath',
      selector: xpath,
      ...(isAbsolute && { warning: 'absolute-xpath' }),
      framework: {
        playwright: `page.locator('xpath=${xpath}')`,
        cypress: `cy.xpath(${JSON.stringify(xpath)})`,
        seleniumPy: `driver.find_element(By.XPATH, ${JSON.stringify(xpath)})`,
      },
    }
  }
}
