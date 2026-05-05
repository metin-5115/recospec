import type { LocatorBundle, ScoredLocator } from '@shared/types/locator'
import { LOCATOR_FALLBACK_COUNT } from '@shared/constants'
import { TestIdStrategy } from './strategies/testid'
import type { LocatorStrategy } from './strategies/base'

export class LocatorEngine {
  private readonly strategies: LocatorStrategy[] = [new TestIdStrategy()]

  evaluate(element: Element, doc: Document): LocatorBundle | null {
    const candidates: ScoredLocator[] = []

    for (const strategy of this.strategies) {
      const locator = strategy.evaluate(element, doc)
      if (locator) {
        // Simplified scoring: higher basePriority number = lower priority
        const score = Math.round(100 / strategy.basePriority)
        candidates.push({ ...locator, score })
      }
    }

    if (candidates.length === 0) return null

    candidates.sort((a, b) => b.score - a.score)
    const [primary, ...rest] = candidates
    return {
      primary,
      fallbacks: rest.slice(0, LOCATOR_FALLBACK_COUNT),
      rejected: rest.slice(LOCATOR_FALLBACK_COUNT),
    }
  }
}
