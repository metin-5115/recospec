import type { IRElement, TestDataConfig } from '../../ir/types'
import { resolveTestData } from '../../planner/test-data-resolver'

/** Render the value-substitution expression for a Playwright fill. */
export function renderFillValueExpr(
  el: IRElement | undefined,
  recordedValue: string,
  testData: TestDataConfig | undefined,
): string {
  const r = resolveTestData(el, recordedValue, testData)
  if (!r.useEnvVar) return JSON.stringify(r.literal)
  return `process.env.${r.envVarName} ?? ${JSON.stringify(r.defaultValue)}`
}
