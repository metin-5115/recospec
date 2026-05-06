import type { LocatorStrategyName } from '@shared/types/locator'

export const STRATEGY_BASE_SCORE: Record<LocatorStrategyName, number> = {
  testid: 100,
  'test-attr': 90,
  'aria-label': 85,
  'aria-labelledby': 85,
  'role-name': 85,
  label: 80,
  text: 60,
  id: 70,
  css: 30,
  xpath: 10,
}

export function getSemanticStrength(strategy: LocatorStrategyName): number {
  return STRATEGY_BASE_SCORE[strategy]
}
