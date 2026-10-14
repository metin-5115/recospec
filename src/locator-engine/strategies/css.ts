import type { Locator } from '@shared/types/locator'
import type { LocatorStrategy } from './base'
import { isDynamicClass } from '../scoring/dynamic-detector'
import { cssAttrValue } from '@shared/selector-escape'

function staticClasses(el: Element): string[] {
  return Array.from(el.classList).filter((cls) => !isDynamicClass(cls))
}

function buildSelector(el: Element, doc: Document): string {
  const tag = el.tagName.toLowerCase()
  const type = el.getAttribute('type')
  const name = el.getAttribute('name')
  const placeholder = el.getAttribute('placeholder')
  const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') : null

  // Attribute selectors in preference order. A shared attribute (the same
  // `name` on a radio group, `type="text"` on every field) is not a locator, so
  // only a selector that is unique in scope short-circuits; otherwise fall
  // through to classes and finally a positional path.
  const attributeSelectors: string[] = []
  if (name) attributeSelectors.push(`${tag}[name="${cssAttrValue(name)}"]`)
  if (type && placeholder) {
    attributeSelectors.push(
      `${tag}[type="${cssAttrValue(type)}"][placeholder="${cssAttrValue(placeholder)}"]`,
    )
  }
  if (placeholder) attributeSelectors.push(`${tag}[placeholder="${cssAttrValue(placeholder)}"]`)
  if (type) attributeSelectors.push(`${tag}[type="${cssAttrValue(type)}"]`)
  if (href && href !== '#' && !href.startsWith('javascript')) {
    attributeSelectors.push(`a[href="${cssAttrValue(href)}"]`)
  }
  const uniqueAttribute = attributeSelectors.find((s) => isUniqueIn(doc, s))
  if (uniqueAttribute) return uniqueAttribute

  const classes = staticClasses(el)
  if (classes.length > 0) {
    const classSelector = `${tag}.${classes.map((c) => CSS.escape(c)).join('.')}`
    if (isUniqueIn(doc, classSelector)) return classSelector
  }

  // The element's container: its parent element, or the shadow root when it is
  // a top-level child of one (a shadow root has no `parentElement`).
  const parentNode = el.parentNode
  const siblingsSource: ParentNode | null =
    el.parentElement ??
    (typeof ShadowRoot !== 'undefined' && parentNode instanceof ShadowRoot ? parentNode : null)
  if (siblingsSource) {
    const sameTagSiblings = Array.from(siblingsSource.children).filter(
      (s) => s.tagName === el.tagName,
    )
    const idx = sameTagSiblings.indexOf(el) + 1
    const own = sameTagSiblings.length === 1 ? tag : `${tag}:nth-of-type(${idx})`
    return el.parentElement ? `${el.parentElement.tagName.toLowerCase()} > ${own}` : own
  }

  // Nothing structural to anchor on — the best remaining candidate is the first
  // attribute selector (the engine's constraint filter judges its uniqueness).
  return attributeSelectors[0] ?? tag
}

function isUniqueIn(doc: Document, selector: string): boolean {
  try {
    return doc.querySelectorAll(selector).length === 1
  } catch {
    return false
  }
}

export class CssStrategy implements LocatorStrategy {
  readonly name = 'css'
  readonly basePriority = 8

  evaluate(el: Element, doc: Document): Locator | null {
    const selector = buildSelector(el, doc)
    return {
      strategy: 'css',
      selector,
      framework: {
        playwright: `page.locator(${JSON.stringify(selector)})`,
        cypress: `cy.get(${JSON.stringify(selector)})`,
        seleniumPy: `driver.find_element(By.CSS_SELECTOR, ${JSON.stringify(selector)})`,
      },
    }
  }
}
