import type { LocatorBundle, ScoredLocator } from '@shared/types/locator'
import { LOCATOR_FALLBACK_COUNT } from '@shared/constants'

export class LocatorSelector {
  select(scored: ScoredLocator[]): LocatorBundle {
    const sorted = [...scored].sort((a, b) => b.score - a.score)
    const [primary, ...rest] = sorted
    return {
      primary: primary!,
      fallbacks: rest.slice(0, LOCATOR_FALLBACK_COUNT),
      rejected: rest.slice(LOCATOR_FALLBACK_COUNT),
      allCandidates: sorted,
    }
  }
}
