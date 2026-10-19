import type { IRElement, TestDataConfig } from '../../ir/types'
import { resolveTestData } from '../../planner/test-data-resolver'
import { javaStr } from './locator'

/** Render the value-substitution expression for a Selenium Java `sendKeys` call. */
export function renderFillValueExpr(
  el: IRElement | undefined,
  recordedValue: string,
  testData: TestDataConfig | undefined,
): string {
  const r = resolveTestData(el, recordedValue, testData)
  if (!r.useEnvVar) return javaStr(r.literal)
  return `System.getenv().getOrDefault(${javaStr(r.envVarName)}, ${javaStr(r.defaultValue)})`
}
