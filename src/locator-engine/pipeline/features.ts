import type { Locator, LocatorFeatures } from '@shared/types/locator'
import { shannonEntropy } from '../scoring/dynamic-detector'

/**
 * Extract the concrete-selector feature vector for scoring. Judges what the
 * selector actually relies on (attributes, text, position, depth) rather than
 * which strategy produced it — two `css` candidates can score very differently
 * depending on whether they key on `[name=email]` or on `div > span:nth-of-type(3)`.
 */

const TIER3_STRATEGIES = new Set(['testid', 'test-attr'])
// `placeholder`/`alt`/`title` are author-intent semantic attributes (Playwright
// has first-class getBy* for them) — same tier as ARIA/label.
const TIER2_STRATEGIES = new Set([
  'aria-label',
  'aria-labelledby',
  'role-name',
  'label',
  'placeholder',
  'alt',
  'title',
])
// `name` (form controls) and `href` (links) are structural-but-stable → tier 1,
// alongside `id`.
const TIER1_STRATEGIES = new Set(['name', 'href'])
const LOCALE_DEPENDENT_STRATEGIES = new Set([
  'text',
  'role-name',
  'aria-label',
  'aria-labelledby',
  'label',
  // Placeholder / alt / title are human-authored copy → break under i18n.
  'placeholder',
  'alt',
  'title',
])

/** Attribute names that anchor a selector to author intent rather than structure. */
const TIER1_CSS_ATTRS = /\[(name|placeholder|type|href|alt|title)[*^$]?=/

function cssAttrTier(selector: string): 0 | 1 {
  return TIER1_CSS_ATTRS.test(selector) ? 1 : 0
}

function xpathAttrTier(selector: string): 0 | 1 {
  return /@(name|placeholder|alt|title|href)\b/.test(selector) ? 1 : 0
}

function attrTier(loc: Locator, selector: string): LocatorFeatures['attrTier'] {
  if (TIER3_STRATEGIES.has(loc.strategy)) return 3
  if (TIER2_STRATEGIES.has(loc.strategy)) return 2
  if (loc.strategy === 'id') return 1
  if (TIER1_STRATEGIES.has(loc.strategy)) return 1
  if (loc.strategy === 'css') return cssAttrTier(selector)
  if (loc.strategy === 'xpath') return xpathAttrTier(selector)
  if (loc.strategy === 'composed' && loc.composed) {
    const t = loc.composed.target
    if (t.role) return 2
    if (t.css && TIER1_CSS_ATTRS.test(t.css)) return 1
    return 0
  }
  // Template locators instantiate role/aria-name queries at runtime.
  if (loc.strategy === 'template') return 2
  return 0
}

/** Max entropy across `.class` tokens used by a CSS selector (0 when none). */
function maxClassEntropy(selector: string): number {
  const classes = selector.match(/\.([\w\\-]+)/g)
  if (!classes) return 0
  return Math.max(...classes.map((c) => shannonEntropy(c.slice(1).replace(/\\/g, ''))))
}

/** Strategies whose selector is human text, not a structural query — depth is meaningless. */
const TEXTUAL_STRATEGIES = new Set([
  'text',
  'label',
  'role-name',
  'aria-label',
  'aria-labelledby',
  'testid',
])

/**
 * Blank out quoted attribute/argument values so characters INSIDE strings
 * (spaces in `[placeholder="What needs to be done?"]`, slashes in URLs) are
 * never mistaken for combinators or path steps.
 */
function structuralOnly(selector: string): string {
  return selector.replace(/"[^"]*"|'[^']*'/g, '""')
}

function depthOf(loc: Locator, selector: string): number {
  if (TEXTUAL_STRATEGIES.has(loc.strategy)) return 1
  if (loc.strategy === 'template') return loc.template?.scope ? 2 : 1
  if (loc.strategy === 'xpath') {
    return Math.max(1, structuralOnly(selector).split('/').filter(Boolean).length)
  }
  if (loc.strategy === 'composed' && loc.composed) {
    let steps = 2 // anchor + target
    if (loc.composed.filterText) steps += 1
    if (typeof loc.composed.nthIndex === 'number') steps += 1
    if (loc.composed.anchor.filterText) steps += 1
    if (typeof loc.composed.anchor.nthIndex === 'number') steps += 1
    return steps
  }
  const combinators = (structuralOnly(selector).match(/[\s>+~]/g) ?? []).length
  return combinators + 1
}

function hasPositionalIndex(loc: Locator, selector: string): boolean {
  if (loc.strategy === 'composed') {
    return (
      typeof loc.composed?.nthIndex === 'number' ||
      typeof loc.composed?.anchor.nthIndex === 'number'
    )
  }
  if (loc.strategy === 'xpath') {
    return /\[\d+\]/.test(structuralOnly(selector)) || loc.warning === 'absolute-xpath'
  }
  return /:nth-(of-type|child)\(/.test(selector)
}

function localeDependent(loc: Locator): boolean {
  if (LOCALE_DEPENDENT_STRATEGIES.has(loc.strategy)) return true
  if (loc.strategy === 'composed' && loc.composed) {
    return Boolean(
      loc.composed.target.name || loc.composed.filterText || loc.composed.anchor.filterText,
    )
  }
  // Date templates pin a locale; param templates take runtime values.
  if (loc.strategy === 'template') return loc.template?.kind === 'date'
  return false
}

export function extractFeatures(loc: Locator): LocatorFeatures {
  const selector = typeof loc.selector === 'string' ? loc.selector : ''
  const composedAnchorTier: LocatorFeatures['anchorTier'] =
    loc.strategy === 'composed' && loc.composed
      ? loc.composed.anchor.kind === 'testid'
        ? 3
        : loc.composed.anchor.kind === 'container'
          ? 1 // text/position-keyed row — weaker than a role/landmark anchor
          : 2
      : 0
  return {
    attrTier: attrTier(loc, selector),
    textIsData: loc.volatile === true,
    classEntropy: maxClassEntropy(
      loc.strategy === 'composed' ? (loc.composed?.target.css ?? '') : selector,
    ),
    depth: depthOf(loc, selector),
    hasPositionalIndex: hasPositionalIndex(loc, selector),
    isComposed: loc.strategy === 'composed',
    anchorTier: composedAnchorTier,
    localeDependent: localeDependent(loc),
  }
}
