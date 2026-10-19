import type { IRElement, TestDataConfig } from '../../ir/types'
import { resolveTestData } from '../../planner/test-data-resolver'

/** Render the value-substitution expression for a Cypress `type()` call. */
export function renderFillValueExpr(
  el: IRElement | undefined,
  recordedValue: string,
  testData: TestDataConfig | undefined,
): string {
  const r = resolveTestData(el, recordedValue, testData)
  if (!r.useEnvVar) return JSON.stringify(r.literal)
  // Cypress.env returns undefined when missing; `||` falls back to the safe default.
  return `Cypress.env(${JSON.stringify(r.paramName)}) || ${JSON.stringify(r.defaultValue)}`
}
