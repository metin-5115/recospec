import type { Locator } from '@shared/types/locator'
import type { LocatorStrategy } from './base'
import { cssAttrValue } from '@shared/selector-escape'

/**
 * Faz 5 strategy expansions. Each produces a CANDIDATE for the constraint /
 * scoring pipeline (it does not have to be unique — the filter handles that).
 * Selectors are plain CSS attribute selectors so the existing `css` resolver
 * path handles them unchanged; Playwright gets its idiomatic `getBy*` where one
 * exists. These rank as gap-fillers: above class-CSS and raw text, below
 * test-ids / ARIA / labels.
 */

/** `placeholder` — Playwright `getByPlaceholder`. */
export class PlaceholderStrategy implements LocatorStrategy {
  readonly name = 'placeholder'
  readonly basePriority = 6

  evaluate(el: Element): Locator | null {
    const value = el.getAttribute('placeholder')?.trim()
    if (!value) return null
    const selector = `[placeholder="${cssAttrValue(value)}"]`
    return {
      strategy: 'placeholder',
      selector,
      framework: {
        playwright: `page.getByPlaceholder(${JSON.stringify(value)})`,
        cypress: `cy.get(${JSON.stringify(selector)})`,
        seleniumPy: `driver.find_element(By.CSS_SELECTOR, ${JSON.stringify(selector)})`,
      },
    }
  }
}

/** `alt` on images / areas — Playwright `getByAltText`. */
export class AltStrategy implements LocatorStrategy {
  readonly name = 'alt'
  readonly basePriority = 6

  evaluate(el: Element): Locator | null {
    const value = el.getAttribute('alt')?.trim()
    if (!value) return null
    const selector = `[alt="${cssAttrValue(value)}"]`
    return {
      strategy: 'alt',
      selector,
      framework: {
        playwright: `page.getByAltText(${JSON.stringify(value)})`,
        cypress: `cy.get(${JSON.stringify(selector)})`,
        seleniumPy: `driver.find_element(By.CSS_SELECTOR, ${JSON.stringify(selector)})`,
      },
    }
  }
}

/** `title` attribute — Playwright `getByTitle`. */
export class TitleStrategy implements LocatorStrategy {
  readonly name = 'title'
  readonly basePriority = 6

  evaluate(el: Element): Locator | null {
    const value = el.getAttribute('title')?.trim()
    if (!value) return null
    const selector = `[title="${cssAttrValue(value)}"]`
    return {
      strategy: 'title',
      selector,
      framework: {
        playwright: `page.getByTitle(${JSON.stringify(value)})`,
        cypress: `cy.get(${JSON.stringify(selector)})`,
        seleniumPy: `driver.find_element(By.CSS_SELECTOR, ${JSON.stringify(selector)})`,
      },
    }
  }
}

/** Form-control `name` — stable identity for inputs without a test id. */
export class NameAttributeStrategy implements LocatorStrategy {
  readonly name = 'name'
  readonly basePriority = 7

  evaluate(el: Element): Locator | null {
    // Only meaningful on form controls — a `name` on a <meta> or <a> is noise.
    const tag = el.tagName.toLowerCase()
    if (!['input', 'select', 'textarea', 'button'].includes(tag)) return null
    const value = el.getAttribute('name')?.trim()
    if (!value) return null
    const selector = `${tag}[name="${cssAttrValue(value)}"]`
    return {
      strategy: 'name',
      selector,
      framework: {
        playwright: `page.locator(${JSON.stringify(selector)})`,
        cypress: `cy.get(${JSON.stringify(selector)})`,
        seleniumPy: `driver.find_element(By.NAME, ${JSON.stringify(value)})`,
      },
    }
  }
}

/** Link `href` path (query string stripped) — stable for navigation links. */
export class HrefStrategy implements LocatorStrategy {
  readonly name = 'href'
  readonly basePriority = 8

  evaluate(el: Element): Locator | null {
    if (el.tagName.toLowerCase() !== 'a') return null
    const raw = el.getAttribute('href')?.trim()
    if (!raw || raw === '#' || raw.startsWith('javascript:')) return null
    const hadQuery = /[?#]/.test(raw)
    const path = raw.split(/[?#]/)[0]
    if (!path) return null
    // Exact match when there was no query; prefix match when we stripped one.
    const selector = hadQuery
      ? `a[href^="${cssAttrValue(path)}"]`
      : `a[href="${cssAttrValue(path)}"]`
    return {
      strategy: 'href',
      selector,
      framework: {
        playwright: `page.locator(${JSON.stringify(selector)})`,
        cypress: `cy.get(${JSON.stringify(selector)})`,
        seleniumPy: `driver.find_element(By.CSS_SELECTOR, ${JSON.stringify(selector)})`,
      },
    }
  }
}
