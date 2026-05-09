import type { Locator, LocatorStrategyName } from '@shared/types/locator'
import { getSemanticStrength } from './semantic-strength'
import { computeUniqueness } from './uniqueness'

const CSS_QUERYABLE: LocatorStrategyName[] = [
  'test-attr',
  'aria-label',
  'aria-labelledby',
  'id',
  'css',
]

function uniquenessFromCount(count: number): 0 | 50 | 100 {
  if (count === 1) return 100
  if (count <= 3) return 50
  return 0
}

function getUniquenessScore(locator: Locator, doc: Document, matchCountHint?: number): number {
  if (locator.strategy === 'testid') return 100
  const selector = typeof locator.selector === 'string' ? locator.selector : null
  if (selector && (CSS_QUERYABLE as string[]).includes(locator.strategy)) {
    if (matchCountHint !== undefined) return uniquenessFromCount(matchCountHint)
    return computeUniqueness(selector, doc)
  }
  return 75
}

function getStabilityScore(strategy: LocatorStrategyName): number {
  if (strategy === 'css' || strategy === 'xpath') return 0
  if (strategy === 'text' || strategy === 'id') return 50
  return 100
}

function getDepthScore(selector: string): number {
  const combinatorCount = (selector.match(/[\s>+~]/g) ?? []).length
  return Math.max(0, 100 - combinatorCount * 25)
}

/**
 * Computes the stability score for a candidate locator.
 *
 * @param matchCountHint  Optional precomputed querySelectorAll count, passed
 *   by the engine to avoid double-querying. Test callers may omit it; the
 *   uniqueness sub-score will then be computed lazily.
 */
export function score(
  candidate: Locator,
  _element: Element,
  doc: Document,
  matchCountHint?: number,
): number {
  const uniqueness = getUniquenessScore(candidate, doc, matchCountHint)
  const semantic = getSemanticStrength(candidate.strategy)
  const stability = getStabilityScore(candidate.strategy)
  const selectorStr = typeof candidate.selector === 'string' ? candidate.selector : ''
  const depth = getDepthScore(selectorStr)

  return Math.round(uniqueness * 0.4 + semantic * 0.3 + stability * 0.2 + depth * 0.1)
}
