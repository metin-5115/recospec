import type { IRElement, TestDataConfig } from '../../ir/types'
import { resolveTestData } from '../../planner/test-data-resolver'

// Module-scoped render options. The orchestrator flips them before each render
// via FrameworkAdapter.applyOptions; the defaults keep snapshot tests stable.
let RENDER_MOCKS = false
export function setRenderMocks(value: boolean): void {
  RENDER_MOCKS = value
}
export function getRenderMocks(): boolean {
  return RENDER_MOCKS
}

let TEST_DATA: TestDataConfig | undefined
export function setTestData(value: TestDataConfig | undefined): void {
  TEST_DATA = value
}
export function getTestData(): TestDataConfig | undefined {
  return TEST_DATA
}

/** Render the value-substitution expression for a Playwright fill. */
export function renderFillValueExpr(el: IRElement | undefined, recordedValue: string): string {
  const r = resolveTestData(el, recordedValue, TEST_DATA)
  if (!r.useEnvVar) return JSON.stringify(r.literal)
  return `process.env.${r.envVarName} ?? ${JSON.stringify(r.defaultValue)}`
}
