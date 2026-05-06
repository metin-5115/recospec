import type { Locator } from '@shared/types/locator'
import type { LocatorStrategy } from './base'

function buildSelector(el: Element): string {
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

  return tag
}

export class CssStrategy implements LocatorStrategy {
  readonly name = 'css'
  readonly basePriority = 8

  evaluate(el: Element, _doc: Document): Locator | null {
    const selector = buildSelector(el)
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
