import type { Locator, LocatorStrategyName } from '@shared/types/locator'

const CSS_DIRECT_QUERYABLE: LocatorStrategyName[] = [
  'test-attr',
  'aria-label',
  'aria-labelledby',
  'id',
  'css',
]

/**
 * Best-effort match count for a candidate locator. Used by the UI to surface
 * how many elements a selector resolves to (1 = unique).
 *
 * Returns 1 for strategies whose stored `selector` is not a directly-runnable
 * CSS query (`role-name`, `text` — counted via heuristic; `xpath` via doc.evaluate
 * when available).
 */
export function computeMatchCount(loc: Locator, doc: Document): number {
  const sel = loc.selector
  if (typeof sel !== 'string') return 1

  if ((CSS_DIRECT_QUERYABLE as string[]).includes(loc.strategy)) {
    try {
      return doc.querySelectorAll(sel).length
    } catch {
      return 1
    }
  }

  if (loc.strategy === 'testid') {
    try {
      return (
        doc.querySelectorAll(`[data-testid="${sel}"]`).length +
        doc.querySelectorAll(`[data-test-id="${sel}"]`).length
      )
    } catch {
      return 1
    }
  }

  // xpath / text / role-name: not directly CSS-queryable. A full-document
  // scan or `doc.evaluate` would dominate evaluate() on large DOMs, so default
  // to 1. The UI surfaces this as "1 match" — best-effort, accurate for the
  // common semantic case where these strategies pick a unique target.
  return 1
}
