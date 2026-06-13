import type { Locator } from '@shared/types/locator'
import type { LocatorStrategy } from './base'
import { isDynamicClass } from '../scoring/dynamic-detector'

function staticClasses(el: Element): string[] {
  return Array.from(el.classList).filter((cls) => !isDynamicClass(cls))
}

function buildSelector(el: Element, doc: Document): string {
  const tag = el.tagName.toLowerCase()
  const type = el.getAttribute('type')
  const name = el.getAttribute('name')
  const placeholder = el.getAttribute('placeholder')
  const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') : null

  if (name) return `${tag}[name="${name}"]`
  if (type && placeholder) return `${tag}[type="${type}"][placeholder="${placeholder}"]`
  if (placeholder) return `${tag}[placeholder="${placeholder}"]`
  if (type) return `${tag}[type="${type}"]`
  if (href && href !== '#' && !href.startsWith('javascript')) return `a[href="${href}"]`

  const classes = staticClasses(el)
  if (classes.length > 0) {
    const classSelector = `${tag}.${classes.map((c) => CSS.escape(c)).join('.')}`
    try {
      if (doc.querySelectorAll(classSelector).length === 1) return classSelector
    } catch {
      // fall through
    }
  }

  const parent = el.parentElement
  if (parent) {
    const parentTag = parent.tagName.toLowerCase()
    const sameTagSiblings = Array.from(parent.children).filter((s) => s.tagName === el.tagName)
    if (sameTagSiblings.length === 1) return `${parentTag} > ${tag}`
    const idx = sameTagSiblings.indexOf(el) + 1
    return `${parentTag} > ${tag}:nth-of-type(${idx})`
  }

  return tag
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
