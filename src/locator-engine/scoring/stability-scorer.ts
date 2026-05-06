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

function getUniquenessScore(locator: Locator, doc: Document): number {
  if (locator.strategy === 'testid') return 100
  const selector = typeof locator.selector === 'string' ? locator.selector : null
  if (selector && (CSS_QUERYABLE as string[]).includes(locator.strategy)) {
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

export function score(candidate: Locator, _element: Element, doc: Document): number {
  const uniqueness = getUniquenessScore(candidate, doc)
  const semantic = getSemanticStrength(candidate.strategy)
  const stability = getStabilityScore(candidate.strategy)
  const selectorStr = typeof candidate.selector === 'string' ? candidate.selector : ''
  const depth = getDepthScore(selectorStr)

  return Math.round(uniqueness * 0.4 + semantic * 0.3 + stability * 0.2 + depth * 0.1)
}
