import type { Locator } from '@shared/types/locator'
import type { LocatorStrategy } from './base'
import { isDynamicId, isDynamicClass } from '../scoring/dynamic-detector'
import { xpathLiteral } from '@shared/selector-escape'

const SEMANTIC_TAGS = new Set([
  'form',
  'nav',
  'table',
  'dialog',
  'main',
  'section',
  'article',
  'aside',
  'header',
  'footer',
])

function uniqueInDoc(doc: Document, css: string): boolean {
  try {
    return doc.querySelectorAll(css).length === 1
  } catch {
    return false
  }
}

/**
 * A stable, DOCUMENT-UNIQUE anchorable ancestor (non-dynamic id, unique stable
 * class set, or unique semantic tag). Uniqueness matters twice: a non-unique
 * anchor neither helps the selector be unique NOR is cheap to resolve (a
 * `//div.card/p` that matches 100 nodes forces an O(n) `document.evaluate`
 * snapshot), so we only scope to ancestors that genuinely narrow the search.
 */
function stableAncestorXPath(el: Element, doc: Document): string | null {
  const id = el.getAttribute('id')
  if (id && !isDynamicId(id)) return `//*[@id=${xpathLiteral(id, '"')}]`
  const tag = el.tagName.toLowerCase()
  const classes = Array.from(el.classList).filter((c) => !isDynamicClass(c))
  if (classes.length) {
    const cssSel = `${tag}.${classes.map((c) => CSS.escape(c)).join('.')}`
    if (uniqueInDoc(doc, cssSel)) {
      const preds = classes
        .map(
          (c) =>
            `contains(concat(' ', normalize-space(@class), ' '), ${xpathLiteral(` ${c} `, '"')})`,
        )
        .join(' and ')
      return `//${tag}[${preds}]`
    }
  }
  if (SEMANTIC_TAGS.has(tag) && uniqueInDoc(doc, tag)) return `//${tag}`
  return null
}

/**
 * 1-based position of `el` among its same-tag siblings plus their count. Walks
 * siblings rather than the `children` collection, which is slow to enumerate
 * on long lists (jsdom).
 */
function sameTagPosition(el: Element, parent: Element): { count: number; position: number } {
  let count = 0
  let position = 0
  for (let sibling = parent.firstElementChild; sibling; sibling = sibling.nextElementSibling) {
    if (sibling.tagName !== el.tagName) continue
    count++
    if (sibling === el) position = count
  }
  return { count, position }
}

function buildXPath(el: Element, doc: Document): { xpath: string; isAbsolute: boolean } {
  const tag = el.tagName.toLowerCase()

  const name = el.getAttribute('name')?.trim()
  const placeholder = el.getAttribute('placeholder')?.trim()
  if (name) return { xpath: `//${tag}[@name=${xpathLiteral(name, '"')}]`, isAbsolute: false }
  if (placeholder)
    return { xpath: `//${tag}[@placeholder=${xpathLiteral(placeholder, '"')}]`, isAbsolute: false }

  const segments: string[] = []
  let current: Element | null = el

  while (current && current !== doc.documentElement && current !== doc.body) {
    const parentEl: Element | null = current.parentElement
    if (!parentEl) break

    const t = current.tagName.toLowerCase()
    const { count, position } = sameTagPosition(current, parentEl)
    const segment = count > 1 ? `${t}[${position}]` : t
    segments.unshift(segment)

    const parentId = parentEl.getAttribute('id')
    if (parentId && !isDynamicId(parentId)) {
      return {
        xpath: `//*[@id=${xpathLiteral(parentId, '"')}]/${segments.join('/')}`,
        isAbsolute: false,
      }
    }

    // Scope to the nearest STABLE, UNIQUE ancestor (stable class / semantic tag)
    // with a RELATIVE descendant path instead of a body-rooted absolute one.
    const anchorXPath = stableAncestorXPath(parentEl, doc)
    if (anchorXPath) {
      return { xpath: `${anchorXPath}/${segments.join('/')}`, isAbsolute: false }
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
