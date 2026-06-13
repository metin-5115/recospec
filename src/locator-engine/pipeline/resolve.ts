import type { Locator } from '@shared/types/locator'
import { computeAccessibleName } from '../strategies/accessible-name'
import { selectorForRole } from '../strategies/role-table'

/**
 * Strategy-aware locator resolution against a record-time DOM snapshot.
 *
 * This is the single source of truth for two pipeline stages:
 *  - the uniqueness constraint (a candidate must resolve to EXACTLY the
 *    recorded element), and
 *  - post-production bundle validation.
 *
 * Counting semantics follow how the target frameworks actually match:
 *  - accessible-name strategies (`role-name`, `label`, `text`) count only
 *    a11y-visible elements — a hidden duplicate nav menu must not make a
 *    visible button "non-unique";
 *  - CSS-based strategies count the whole DOM, hidden or not, because
 *    `querySelector` does.
 */

/**
 * Best-effort accessibility-visibility check.
 *
 * ASSUMPTION: only structural signals (`hidden`, `aria-hidden`,
 * `input[type=hidden]`) and INLINE styles are consulted — `getComputedStyle`
 * per element would dominate the engine's perf budget on large DOMs (and
 * returns layout-free defaults under jsdom anyway). Elements hidden purely by
 * a stylesheet class are therefore still counted; that errs in the SAFE
 * direction — a candidate can only look LESS unique than it really is, never
 * more, so no broken primary can slip through.
 */
export function isA11yVisible(el: Element): boolean {
  let current: Element | null = el
  while (current) {
    if (current.hasAttribute('hidden')) return false
    if (current.getAttribute('aria-hidden') === 'true') return false
    if (current instanceof HTMLInputElement && current.type === 'hidden') return false
    const style = (current as HTMLElement).style
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false
    current = current.parentElement
  }
  return true
}

function queryAll(doc: Document | Element, selector: string): Element[] {
  try {
    return Array.from(doc.querySelectorAll(selector))
  } catch {
    return []
  }
}

function normText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

/** Normalized concatenation of an element's DIRECT text nodes (no descendants). */
function directText(el: Element): string {
  let out = ''
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3 /* TEXT_NODE */) out += child.nodeValue ?? ''
  }
  return normText(out)
}

/**
 * Elements that CARRY the text (direct text nodes equal the value) — the
 * innermost matches, mirroring how `getByText` style queries pick the smallest
 * matching element instead of flagging every wrapping ancestor as a duplicate.
 * Direct-node comparison keeps this O(total nodes) instead of the O(n²) a
 * per-element subtree `textContent` scan would cost on large DOMs.
 */
function resolveByText(text: string, scope: Document | Element): Element[] {
  return queryAll(scope, '*').filter((el) => directText(el) === text && isA11yVisible(el))
}

/**
 * Above this many role-prefiltered elements, the spec-complete (but heavier)
 * dom-accessibility-api computation is swapped for the project's lightweight
 * accname chain — counting stays correct for the common attribute/content
 * naming paths while keeping huge grids inside the perf budget.
 */
const ACCNAME_FAST_PATH_THRESHOLD = 300

/** Cheap accname pre-screen: aria-label, else direct text. Null = inconclusive. */
function quickNameGuess(el: Element): string | null {
  const ariaLabel = el.getAttribute('aria-label')?.trim()
  if (ariaLabel) return normText(ariaLabel)
  const own = directText(el)
  return own || null
}

function resolveByRoleName(role: string, name: string, scope: Document | Element): Element[] {
  const doc = scope instanceof Document ? scope : scope.ownerDocument
  const prefiltered = queryAll(scope, selectorForRole(role)).filter(isA11yVisible)
  const useFullAccname = prefiltered.length <= ACCNAME_FAST_PATH_THRESHOLD
  return prefiltered.filter((el) => {
    // Pre-screen with the cheap guess: aria-label wins accname precedence, so
    // a non-matching guess safely excludes without the full computation.
    const guess = quickNameGuess(el)
    if (guess !== null && guess !== name && el.getAttribute('aria-label')) return false
    if (guess === name) return true
    if (!useFullAccname) return guess === name
    return normText(computeAccessibleName(el, doc, role)) === name
  })
}

function resolveByLabel(labelText: string, scope: Document | Element): Element[] {
  const results: Element[] = []
  for (const label of queryAll(scope, 'label')) {
    if (normText(label.textContent) !== labelText && !labelTextWithoutControls(label, labelText)) {
      continue
    }
    const forId = label.getAttribute('for')
    if (forId) {
      const control = (scope instanceof Document ? scope : scope.ownerDocument).getElementById(
        forId,
      )
      if (control && isA11yVisible(control)) results.push(control)
      continue
    }
    const nested = label.querySelector('input, select, textarea')
    if (nested && isA11yVisible(nested)) results.push(nested)
  }
  return results
}

function labelTextWithoutControls(label: Element, expected: string): boolean {
  const clone = label.cloneNode(true) as Element
  clone.querySelectorAll('input, select, textarea').forEach((c) => c.remove())
  return normText(clone.textContent) === expected
}

const XPATH_ATTR_FORM = /^\/\/(\w+)\[@([\w-]+)=(?:"([^"]*)"|'([^']*)')\]$/
const XPATH_SEGMENT = /^(\w+)(?:\[(\d+)\])?$/

/** Walk `tag[n]/tag/tag[n]` segments from a start element's children. */
function walkSegments(start: Element, segments: string[]): Element[] {
  let current: Element[] = [start]
  for (const segment of segments) {
    const match = segment.match(XPATH_SEGMENT)
    if (!match) return [] // not a shape we can walk — caller falls back
    const [, tag, index] = match
    const next: Element[] = []
    for (const el of current) {
      const children = Array.from(el.children).filter(
        (c) => c.tagName.toLowerCase() === tag.toLowerCase(),
      )
      if (index !== undefined) {
        const picked = children[Number(index) - 1]
        if (picked) next.push(picked)
      } else {
        next.push(...children)
      }
    }
    current = next
    if (current.length === 0) return []
  }
  return current
}

/**
 * XPath resolution with structural fast paths for the exact shapes OUR XPath
 * strategy generates (attribute lookups, id-anchored and absolute positional
 * paths). jsdom's generic `document.evaluate` is an order of magnitude slower
 * and only runs for foreign shapes.
 */
function resolveByXPath(xpath: string, doc: Document): Element[] {
  const attr = xpath.match(XPATH_ATTR_FORM)
  if (attr) {
    const [, tag, name, dq, sq] = attr
    return queryAll(doc, `${tag}[${name}="${dq ?? sq ?? ''}"]`)
  }

  const idAnchored = xpath.match(/^\/\/\*\[@id="([^"]*)"\]\/(.+)$/)
  if (idAnchored) {
    const start = doc.getElementById(idAnchored[1])
    if (!start) return []
    const walked = walkSegments(start, idAnchored[2].split('/'))
    if (walked.length > 0 || idAnchored[2].split('/').every((s) => XPATH_SEGMENT.test(s))) {
      return walked
    }
  }

  const absolute = xpath.match(/^\/\/(.+)$/)
  if (absolute && !xpath.includes('[@') && !xpath.includes('normalize-space')) {
    const segments = absolute[1].split('/')
    if (segments.every((s) => XPATH_SEGMENT.test(s)) && doc.body) {
      return walkSegments(doc.body, segments)
    }
  }

  try {
    const result = doc.evaluate(xpath, doc, null, 7 /* ORDERED_NODE_SNAPSHOT_TYPE */, null)
    const out: Element[] = []
    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i)
      if (node instanceof Element) out.push(node)
    }
    return out
  } catch {
    return []
  }
}

/** Parse the role-name selector shape `role[name="..."]` produced by the strategy. */
function parseRoleNameSelector(selector: string): { role: string; name: string } | null {
  const match = selector.match(/^([\w-]+)\[name="([\s\S]*)"\]$/)
  if (!match) return null
  return { role: match[1], name: match[2] }
}

/**
 * Resolve the anchor scope. Clean anchors must be document-unique; a
 * `container` anchor narrows a non-unique selector by `filterText` (hasText /
 * SUBSTRING — the card's textContent holds more than the label) then by
 * `nthIndex`. Returns null unless exactly one scope remains.
 */
function resolveAnchorScope(
  anchor: NonNullable<Locator['composed']>['anchor'],
  doc: Document,
): Element | null {
  let anchors = queryAll(doc, anchor.css)
  if (anchor.filterText !== undefined) {
    const t = anchor.filterText
    anchors = anchors.filter((a) => normText(a.textContent).includes(t))
  }
  if (typeof anchor.nthIndex === 'number') {
    return anchors[anchor.nthIndex] ?? null
  }
  return anchors.length === 1 ? anchors[0] : null
}

function resolveComposed(loc: Locator, doc: Document): Element[] {
  const spec = loc.composed
  if (!spec) return []
  const scope = resolveAnchorScope(spec.anchor, doc)
  if (!scope) return []

  let matches: Element[]
  if (spec.target.role && spec.target.name) {
    matches = resolveByRoleName(spec.target.role, spec.target.name, scope)
  } else if (spec.target.css) {
    matches = queryAll(scope, spec.target.css)
  } else if (spec.target.role) {
    matches = queryAll(scope, selectorForRole(spec.target.role)).filter(isA11yVisible)
  } else {
    matches = queryAll(scope, spec.target.tag)
  }

  if (spec.filterText) {
    const text = spec.filterText
    matches = matches.filter((el) => normText(el.textContent) === text)
  }
  if (typeof spec.nthIndex === 'number') {
    const picked = matches[spec.nthIndex]
    return picked ? [picked] : []
  }
  return matches
}

/**
 * Resolve a candidate locator to the elements it matches in `doc`.
 * Returns `[]` on malformed selectors rather than throwing.
 */
export function resolveLocator(loc: Locator, doc: Document): Element[] {
  const sel = typeof loc.selector === 'string' ? loc.selector : null

  switch (loc.strategy) {
    case 'testid': {
      if (!sel) return []
      // Mirrors TestIdStrategy's attribute family (data-testid / data-test-id / data-cy).
      return [
        ...queryAll(doc, `[data-testid="${sel}"]`),
        ...queryAll(doc, `[data-test-id="${sel}"]`),
        ...queryAll(doc, `[data-cy="${sel}"]`),
      ]
    }
    // `css` + the attribute strategies all emit a plain CSS selector.
    case 'test-attr':
    case 'aria-label':
    case 'aria-labelledby':
    case 'id':
    case 'css':
    case 'placeholder':
    case 'alt':
    case 'title':
    case 'name':
    case 'href':
      return sel ? queryAll(doc, sel) : []
    case 'label':
      return sel ? resolveByLabel(sel, doc) : []
    case 'text':
      return sel ? resolveByText(sel, doc) : []
    case 'role-name': {
      if (!sel) return []
      const parsed = parseRoleNameSelector(sel)
      if (!parsed) return []
      return resolveByRoleName(parsed.role, parsed.name, doc)
    }
    case 'xpath':
      return sel ? resolveByXPath(sel, doc) : []
    case 'composed':
      return resolveComposed(loc, doc)
    case 'template':
      return resolveTemplate(loc, doc)
    default:
      return []
  }
}

/** Resolve a template locator by instantiating it with the captured value. */
function resolveTemplate(loc: Locator, doc: Document): Element[] {
  const spec = loc.template
  if (!spec) return []
  let scope: Document | Element = doc
  if (spec.scope) {
    const anchors = queryAll(doc, spec.scope.css)
    if (anchors.length !== 1) return []
    scope = anchors[0]
  }
  if (spec.strategy === 'role-name' && spec.role) {
    return resolveByRoleName(spec.role, spec.capturedValue, scope)
  }
  if (spec.strategy === 'aria-label') {
    return queryAll(scope, `[aria-label="${spec.capturedValue.replace(/"/g, '\\"')}"]`)
  }
  return resolveByText(spec.capturedValue, scope)
}

/** Match count for a candidate — `resolveLocator(...).length` with a stable name. */
export function computeMatchCount(loc: Locator, doc: Document): number {
  return resolveLocator(loc, doc).length
}
