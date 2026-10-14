import type { ComposedSpec, Locator } from '@shared/types/locator'
import { isDynamicValue } from '@shared/dynamic-value'
import { isDynamicClass } from '../scoring/dynamic-detector'
import { computeAccessibleName } from './accessible-name'
import { selectorForRole } from './role-table'
import { isA11yVisible } from '../pipeline/resolve'
import { cssAttrValue, xpathLiteral } from '@shared/selector-escape'
import { MAX_CONTAINER_GROUP_SIZE } from '@shared/constants'

/**
 * Composed (anchor + target) locator production — invoked by the engine when
 * no flat candidate survives the constraint filter with a healthy score.
 *
 * Algorithm:
 *  1. Find the nearest STABLE, document-unique anchor above the element:
 *     a testid-family holder, an explicit semantic role container, or a
 *     semantic landmark tag. Portal popups still work because the popup
 *     container IS a DOM ancestor of the clicked element; shadow-crossing
 *     paths are supplied by the content adapter via `composedPath`.
 *  2. Resolve the target inside that scope, walking the uniquification
 *     ladder: scope alone → content filter → positional index (last resort,
 *     flagged FRAGILE in diagnostics and generated code).
 */

const TESTID_ATTRS = [
  'data-testid',
  'data-test-id',
  'data-cy',
  'data-test',
  'data-qa',
  'data-automation',
] as const

const SEMANTIC_ANCHOR_ROLES = new Set([
  'dialog',
  'grid',
  'table',
  'navigation',
  'form',
  'region',
  'tablist',
  'listbox',
  'menu',
])

// `main` is deliberately excluded: it wraps ~all page content, so it never
// meaningfully narrows a scope — using it as an anchor only produced fragile
// `main >> … >> nth=N` composeds that masked the better container-by-label
// anchor (the repeated-card case) and clean flat locators. The remaining tags
// genuinely bound a region.
const SEMANTIC_ANCHOR_TAGS = new Set(['form', 'nav', 'table', 'dialog'])

/** Interactive ancestors usable as a scope when document-unique (CTA buttons, links). */
const INTERACTIVE_ANCHOR_TAGS = new Set(['button', 'a'])
const INTERACTIVE_ANCHOR_ROLES = new Set(['button', 'link', 'menuitem', 'tab', 'option'])

interface AnchorInfo {
  el: Element
  kind: ComposedSpec['anchor']['kind']
  value: string
  css: string
  xpath: string
  /** Container anchors only: stable disambiguating descendant text. */
  filterText?: string
  /** Container anchors only: positional index among same-css containers. */
  nthIndex?: number
}

function uniqueInDoc(css: string, doc: Document): boolean {
  try {
    return doc.querySelectorAll(css).length === 1
  } catch {
    return false
  }
}

function anchorFor(el: Element, doc: Document): AnchorInfo | null {
  for (const attr of TESTID_ATTRS) {
    const value = el.getAttribute(attr)
    if (value) {
      const css = `[${attr}="${cssAttrValue(value)}"]`
      if (uniqueInDoc(css, doc)) {
        return { el, kind: 'testid', value, css, xpath: `//*[@${attr}=${xpathLiteral(value)}]` }
      }
    }
  }
  const role = el.getAttribute('role')
  if (role && SEMANTIC_ANCHOR_ROLES.has(role)) {
    const css = `[role="${role}"]`
    if (uniqueInDoc(css, doc)) {
      return { el, kind: 'role', value: role, css, xpath: `//*[@role='${role}']` }
    }
  }
  const tag = el.tagName.toLowerCase()
  if (SEMANTIC_ANCHOR_TAGS.has(tag)) {
    if (uniqueInDoc(tag, doc)) {
      return { el, kind: 'tag', value: tag, css: tag, xpath: `//${tag}` }
    }
  }
  return interactiveAnchorFor(el, doc, tag, role)
}

/**
 * A unique interactive ancestor (a CTA button / link / role widget) used as a
 * scope when no testid/landmark exists — e.g. clicking a `<span>` inside a
 * single `<button class="cta">`. Must be document-unique by a stable selector.
 */
function interactiveAnchorFor(
  el: Element,
  doc: Document,
  tag: string,
  role: string | null,
): AnchorInfo | null {
  const interactive =
    INTERACTIVE_ANCHOR_TAGS.has(tag) || (role !== null && INTERACTIVE_ANCHOR_ROLES.has(role))
  if (!interactive) return null

  const stableClasses = Array.from(el.classList).filter((c) => !isDynamicClass(c))
  if (stableClasses.length) {
    const css = `${tag}.${stableClasses.map((c) => CSS.escape(c)).join('.')}`
    if (uniqueInDoc(css, doc)) {
      const preds = stableClasses
        .map((c) => `contains(concat(' ', normalize-space(@class), ' '), ' ${c} ')`)
        .join(' and ')
      return { el, kind: 'tag', value: css, css, xpath: `//${tag}[${preds}]` }
    }
  }
  if (tag === 'a') {
    const raw = el.getAttribute('href')?.trim()
    const path = raw && raw !== '#' && !raw.startsWith('javascript:') ? raw.split(/[?#]/)[0] : ''
    if (path) {
      // Prefix-match when a query/hash was stripped (the DOM attr still has it).
      const hadQuery = raw !== path
      const css = hadQuery ? `a[href^="${cssAttrValue(path)}"]` : `a[href="${cssAttrValue(path)}"]`
      const xpath = hadQuery
        ? `//a[starts-with(@href, ${xpathLiteral(path)})]`
        : `//a[@href=${xpathLiteral(path)}]`
      if (uniqueInDoc(css, doc)) {
        return { el, kind: 'tag', value: css, css, xpath }
      }
    }
  }
  if (role && INTERACTIVE_ANCHOR_ROLES.has(role)) {
    const css = `[role="${role}"]`
    if (uniqueInDoc(css, doc)) {
      return { el, kind: 'role', value: role, css, xpath: `//*[@role='${role}']` }
    }
  }
  return null
}

/**
 * Walk ancestors (composedPath when supplied — crosses shadow boundaries —
 * else the parentElement chain) for the nearest stable unique anchor.
 */
function findAnchor(
  el: Element,
  doc: Document,
  composedPath?: readonly EventTarget[],
): AnchorInfo | null {
  if (composedPath?.length) {
    for (const node of composedPath) {
      if (!(node instanceof Element) || node === el) continue
      if (node === doc.documentElement || node === doc.body) break
      const anchor = anchorFor(node, doc)
      if (anchor) return anchor
    }
    return null
  }
  let current: Element | null = el.parentElement
  while (current && current !== doc.documentElement && current !== doc.body) {
    const anchor = anchorFor(current, doc)
    if (anchor) return anchor
    current = current.parentElement
  }
  return null
}

// ---------------------------------------------------------------------------
// Container anchor: a repeated row/card disambiguated by a stable descendant
// label (the "row keyed by entity name" pattern). Fires only when no clean
// (testid / role / landmark) anchor exists — exactly the repeated-list case.
// ---------------------------------------------------------------------------

/** Tag + sorted non-dynamic class set + role — the "shape" two siblings share. */
function shapeKey(el: Element): string {
  const classes = Array.from(el.classList)
    .filter((c) => !isDynamicClass(c))
    .sort()
    .join('.')
  return `${el.tagName}|${classes}|${el.getAttribute('role') ?? ''}`
}

/** Stable, NON-unique CSS for a repeated container (tag + non-dynamic classes). */
function containerCss(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const classes = Array.from(el.classList).filter((c) => !isDynamicClass(c))
  return classes.length ? `${tag}.${classes.map((c) => CSS.escape(c)).join('.')}` : tag
}

/** XPath form of the container CSS (tag + class-contains predicates). */
function containerCssToXPath(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const classes = Array.from(el.classList).filter((c) => !isDynamicClass(c))
  if (!classes.length) return `//${tag}`
  const preds = classes
    .map((c) => `contains(concat(' ', normalize-space(@class), ' '), ' ${c} ')`)
    .join(' and ')
  return `//${tag}[${preds}]`
}

function ancestorChain(
  el: Element,
  doc: Document,
  composedPath?: readonly EventTarget[],
): Element[] {
  if (composedPath?.length) {
    const out: Element[] = []
    for (const node of composedPath) {
      if (!(node instanceof Element) || node === el) continue
      if (node === doc.documentElement || node === doc.body) break
      out.push(node)
    }
    return out
  }
  const out: Element[] = []
  let current = el.parentElement
  while (current && current !== doc.documentElement && current !== doc.body) {
    out.push(current)
    current = current.parentElement
  }
  return out
}

/** Direct text nodes only (no descendants). */
function directTextOf(el: Element): string {
  let out = ''
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) out += child.nodeValue ?? ''
  }
  return out
}

/** Cap candidate labels + group size so the O(candidates × group) probe stays cheap. */
const MAX_LABEL_CANDIDATES = 12

/**
 * Find a stable descendant text inside `container` that uniquely identifies it
 * among `group` (by `textContent` substring — `hasText` semantics), excluding
 * the target's own subtree and any dynamic value. Prefers heading-tagged, then
 * longest — entity names are usually headings.
 *
 * `groupText` is the pre-normalized `textContent` of each group member, passed
 * in so this is O(candidates × group) string scans, not O(group × subtree).
 */
function findDisambiguatingLabel(
  container: Element,
  target: Element,
  group: Element[],
  groupText: string[],
): string | null {
  const candidates: { text: string; weight: number }[] = []
  for (const node of Array.from(container.querySelectorAll('*'))) {
    if (node === target || target.contains(node) || node.contains(target)) continue
    const text = normText(directTextOf(node))
    if (!text || text.length > 80 || isDynamicValue(text)) continue
    const heading = /^H[1-6]$/.test(node.tagName) || node.getAttribute('role') === 'heading'
    candidates.push({ text, weight: (heading ? 1000 : 0) + text.length })
  }
  candidates.sort((a, b) => b.weight - a.weight)
  for (const { text } of candidates.slice(0, MAX_LABEL_CANDIDATES)) {
    // The label must single out exactly this container across the group.
    let owner: Element | null = null
    let count = 0
    for (let i = 0; i < group.length; i++) {
      if (groupText[i]!.includes(text)) {
        count++
        owner = group[i]!
        if (count > 1) break
      }
    }
    if (count === 1 && owner === container) return text
  }
  return null
}

/**
 * The "row keyed by entity name" anchor: nearest repeated container,
 * disambiguated by a stable descendant label (or a positional index when no
 * stable label exists). Returns null when no repeated container is found.
 */
function findContainerAnchor(
  el: Element,
  doc: Document,
  composedPath?: readonly EventTarget[],
): AnchorInfo | null {
  // A nearer repeated container with no stable label is a positional last
  // resort — but a LARGER ancestor may carry the entity name (e.g. the card
  // that holds a `.price-row` wrapper). Climb past the small wrapper to prefer
  // a stable-label anchor; only fall back to the nearest positional if no
  // ancestor yields a label.
  let positionalFallback: AnchorInfo | null = null
  for (const container of ancestorChain(el, doc, composedPath)) {
    const key = shapeKey(container)
    const css = containerCss(container)
    const group = queryAll(doc, css).filter((c) => shapeKey(c) === key)
    if (group.length < 2 || group.length > MAX_CONTAINER_GROUP_SIZE) continue

    const baseXPath = containerCssToXPath(container)
    const groupText = group.map((c) => normText(c.textContent))
    const label = findDisambiguatingLabel(container, el, group, groupText)
    if (label) {
      return {
        el: container,
        kind: 'container',
        value: label,
        css,
        filterText: label,
        xpath: `${baseXPath}[contains(normalize-space(.), ${xpathLiteral(label)})]`,
      }
    }
    if (!positionalFallback) {
      const idx = group.indexOf(container)
      if (idx !== -1) {
        positionalFallback = {
          el: container,
          kind: 'container',
          value: css,
          css,
          nthIndex: idx,
          xpath: `(${baseXPath})[${idx + 1}]`,
        }
      }
    }
  }
  if (positionalFallback) return positionalFallback
  return null
}

function queryAll(doc: Document, css: string): Element[] {
  try {
    return Array.from(doc.querySelectorAll(css))
  } catch {
    return []
  }
}

interface TargetBase {
  role?: string
  name?: string
  css?: string
  /** Elements this base matches inside the anchor scope. */
  matches: Element[]
}

function normText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function explicitOrImplicitRole(el: Element): string | null {
  const explicit = el.getAttribute('role')?.trim()
  if (explicit) return explicit
  // Implicit role detection mirrors RoleNameStrategy via the shared table.
  const candidates = ['button', 'link', 'gridcell', 'cell', 'option', 'tab', 'menuitem']
  for (const role of candidates) {
    try {
      if (el.matches(selectorForRole(role))) return role
    } catch {
      /* selector list may contain :scope-incompatible parts — skip */
    }
  }
  return null
}

function roleMatchesInScope(
  scope: Element,
  role: string,
  name: string | undefined,
  doc: Document,
): Element[] {
  let matches: Element[]
  try {
    matches = Array.from(scope.querySelectorAll(selectorForRole(role))).filter(isA11yVisible)
  } catch {
    return []
  }
  if (name === undefined) return matches
  return matches.filter((el) => normText(computeAccessibleName(el, doc, role)) === name)
}

function cssMatchesInScope(scope: Element, css: string): Element[] {
  try {
    return Array.from(scope.querySelectorAll(css))
  } catch {
    return []
  }
}

function targetBases(el: Element, scope: Element, doc: Document): TargetBase[] {
  const bases: TargetBase[] = []
  const tag = el.tagName.toLowerCase()

  const role = explicitOrImplicitRole(el)
  if (role) {
    const rawName = normText(computeAccessibleName(el, doc, role))
    // A data-value accessible name must never be embedded raw — fall back to
    // role-only scoping (Phase 2 turns these into template locators instead).
    const name = rawName && !isDynamicValue(rawName) ? rawName : undefined
    bases.push({ role, name, matches: roleMatchesInScope(scope, role, name, doc) })
  }

  const stableClasses = Array.from(el.classList).filter((c) => !isDynamicClass(c))
  if (stableClasses.length > 0) {
    const css = `${tag}.${stableClasses.map((c) => CSS.escape(c)).join('.')}`
    bases.push({ css, matches: cssMatchesInScope(scope, css) })
  }

  bases.push({ css: tag, matches: cssMatchesInScope(scope, tag) })
  return bases.filter((b) => b.matches.length > 0 && b.matches.includes(el))
}

function buildXPath(
  anchor: AnchorInfo,
  spec: Omit<ComposedSpec, 'xpath' | 'anchor'>,
  tag: string,
): string {
  let target: string
  if (spec.target.role && spec.target.name) {
    target = `//${tag}[normalize-space()=${xpathLiteral(spec.target.name)}]`
  } else if (spec.target.css) {
    const classes = spec.target.css.match(/\.([\w\\-]+)/g)?.map((c) => c.slice(1)) ?? []
    const classPreds = classes
      .map((c) => `contains(concat(' ', normalize-space(@class), ' '), ' ${c} ')`)
      .join(' and ')
    target = classPreds ? `//${tag}[${classPreds}]` : `//${tag}`
  } else {
    target = `//${tag}`
  }
  if (spec.filterText) {
    target += `[normalize-space()=${xpathLiteral(spec.filterText)}]`
  }
  const full = `${anchor.xpath}${target}`
  if (typeof spec.nthIndex === 'number') {
    return `(${full})[${spec.nthIndex + 1}]`
  }
  return full
}

function anchorFilterSuffix(a: ComposedSpec['anchor']): string {
  let s = ''
  if (a.filterText) s += ` hasText="${a.filterText}"`
  if (typeof a.nthIndex === 'number') s += ` nth=${a.nthIndex}`
  return s
}

function humanSelector(spec: ComposedSpec): string {
  const anchor =
    spec.anchor.kind === 'testid'
      ? `testid=${spec.anchor.value}`
      : spec.anchor.kind === 'role'
        ? `role=${spec.anchor.value}`
        : spec.anchor.kind === 'container'
          ? `${spec.anchor.css}${anchorFilterSuffix(spec.anchor)}`
          : spec.anchor.value
  let target: string
  if (spec.target.role && spec.target.name) {
    target = `${spec.target.role}[name="${spec.target.name}"]`
  } else if (spec.target.css) {
    target = spec.target.css
  } else if (spec.target.role) {
    target = `role=${spec.target.role}`
  } else {
    target = spec.target.tag
  }
  let out = `${anchor} >> ${target}`
  if (spec.filterText) out += ` >> text="${spec.filterText}"`
  if (typeof spec.nthIndex === 'number') out += ` >> nth=${spec.nthIndex}`
  return out
}

function playwrightExpr(spec: ComposedSpec): string {
  let scope =
    spec.anchor.kind === 'testid'
      ? `page.getByTestId(${JSON.stringify(spec.anchor.value)})`
      : spec.anchor.kind === 'role'
        ? `page.getByRole(${JSON.stringify(spec.anchor.value)})`
        : `page.locator(${JSON.stringify(spec.anchor.css)})`
  if (spec.anchor.kind === 'container') {
    if (spec.anchor.filterText)
      scope += `.filter({ hasText: ${JSON.stringify(spec.anchor.filterText)} })`
    if (typeof spec.anchor.nthIndex === 'number') scope += `.nth(${spec.anchor.nthIndex})`
  }
  let expr: string
  if (spec.target.role && spec.target.name) {
    expr = `${scope}.getByRole(${JSON.stringify(spec.target.role)}, { name: ${JSON.stringify(spec.target.name)} })`
  } else if (spec.target.css) {
    expr = `${scope}.locator(${JSON.stringify(spec.target.css)})`
  } else if (spec.target.role) {
    expr = `${scope}.getByRole(${JSON.stringify(spec.target.role)})`
  } else {
    expr = `${scope}.locator(${JSON.stringify(spec.target.tag)})`
  }
  if (spec.filterText) expr += `.filter({ hasText: ${JSON.stringify(spec.filterText)} })`
  if (typeof spec.nthIndex === 'number') expr += `.nth(${spec.nthIndex})`
  return expr
}

export interface ComposedOptions {
  composedPath?: readonly EventTarget[]
}

/** Anchor lookup shared with the template strategy. */
export function findStableAnchor(
  el: Element,
  doc: Document,
  composedPath?: readonly EventTarget[],
): { kind: ComposedSpec['anchor']['kind']; value: string; css: string; xpath: string } | null {
  const anchor = findAnchor(el, doc, composedPath)
  return anchor
    ? { kind: anchor.kind, value: anchor.value, css: anchor.css, xpath: anchor.xpath }
    : null
}

/**
 * Build a composed candidate, or `null` when no stable unique anchor exists
 * above the element.
 */
export function buildComposedCandidate(
  el: Element,
  doc: Document,
  options: ComposedOptions = {},
): Locator | null {
  // Clean anchors (testid / role / landmark) win first; the container anchor is
  // the fallback for repeated rows/cards with no stable unique ancestor.
  const anchor =
    findAnchor(el, doc, options.composedPath) ?? findContainerAnchor(el, doc, options.composedPath)
  if (!anchor) return null

  const tag = el.tagName.toLowerCase()
  const bases = targetBases(el, anchor.el, doc)
  if (bases.length === 0) return null

  // Ladder step a: scope alone.
  for (const base of bases) {
    if (base.matches.length === 1 && base.matches[0] === el) {
      return finalize(
        anchor,
        { role: base.role, name: base.name, css: base.css },
        tag,
        undefined,
        undefined,
      )
    }
  }

  // Ladder step b: content filter with the element's own STABLE text.
  const ownText = normText(el.textContent)
  if (ownText && ownText.length <= 80 && !isDynamicValue(ownText)) {
    for (const base of bases) {
      const filtered = base.matches.filter((m) => normText(m.textContent) === ownText)
      if (filtered.length === 1 && filtered[0] === el) {
        return finalize(
          anchor,
          { role: base.role, name: base.name, css: base.css },
          tag,
          ownText,
          undefined,
        )
      }
    }
  }

  // Ladder step c: positional index — genuine last resort, flagged FRAGILE.
  const base = bases[0]
  const index = base.matches.indexOf(el)
  if (index === -1) return null
  return finalize(
    anchor,
    { role: base.role, name: base.name, css: base.css },
    tag,
    undefined,
    index,
  )
}

function finalize(
  anchor: AnchorInfo,
  target: { role?: string; name?: string; css?: string },
  tag: string,
  filterText: string | undefined,
  nthIndex: number | undefined,
): Locator {
  const partial = {
    target: { tag, role: target.role, name: target.name, css: target.css },
    filterText,
    nthIndex,
  }
  const spec: ComposedSpec = {
    anchor: {
      kind: anchor.kind,
      value: anchor.value,
      css: anchor.css,
      ...(anchor.filterText !== undefined && { filterText: anchor.filterText }),
      ...(typeof anchor.nthIndex === 'number' && { nthIndex: anchor.nthIndex }),
    },
    ...partial,
    xpath: buildXPath(anchor, partial, tag),
  }
  const positional = typeof nthIndex === 'number' || typeof anchor.nthIndex === 'number'
  return {
    strategy: 'composed',
    selector: humanSelector(spec),
    composed: spec,
    ...(positional && { warning: 'positional-index' }),
    framework: {
      playwright: playwrightExpr(spec),
    },
  }
}
