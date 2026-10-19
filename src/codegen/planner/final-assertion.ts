import { FINAL_STATE_ASSERTION_ID } from '@shared/constants'
import type { IRStep } from '../ir/types'

/** Route the flow ended on: a trailing navigation's target, else where the last step happened. */
function finalRoute(steps: readonly IRStep[]): string | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (!step) continue
    const route = step.action === 'navigate' ? step.url : step.pageUrl
    if (route?.startsWith('/')) return route
  }
  return undefined
}

/**
 * A recording without any assertion would generate a script that never checks anything. Adds one
 * assertion that the flow ended on the page it was recorded on. Returns the input untouched when
 * the user asserted something or no step carries a route.
 */
export function appendFinalStateAssertion(steps: readonly IRStep[]): IRStep[] {
  if (steps.some((s) => s.action === 'assert')) return [...steps]
  const route = finalRoute(steps)
  if (!route) return [...steps]
  return [
    ...steps,
    {
      id: FINAL_STATE_ASSERTION_ID,
      action: 'assert',
      assertionDetail: { type: 'url', expected: route },
      annotation: `Final state: URL contains ${route}`,
      pageUrl: route,
    },
  ]
}
