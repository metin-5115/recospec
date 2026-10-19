import type { IRElement, TestDataConfig } from '../../ir/types'
import { resolveTestData } from '../../planner/test-data-resolver'
import { pyStr } from './locator'

/** Render the value-substitution expression for a Selenium Python `send_keys` call. */
export function renderFillValueExpr(
  el: IRElement | undefined,
  recordedValue: string,
  testData: TestDataConfig | undefined,
): string {
  const r = resolveTestData(el, recordedValue, testData)
  if (!r.useEnvVar) return pyStr(r.literal)
  return `os.environ.get(${pyStr(r.envVarName)}, ${pyStr(r.defaultValue)})`
}
