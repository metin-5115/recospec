import type { IRPage, IRScenario } from '../../ir/types'
import {
  buildScenarioFlow,
  initialUrl,
  pagesUsed,
  type FlowArg,
  type FlowItem,
} from '../../shared/scenario-flow'
import { resolveTestData } from '../../planner/test-data-resolver'
import { renderStepInSpec } from './step'
import { getTestData, renderFillValueExpr } from './state'

const INDENT = '    '

function toVarName(className: string): string {
  return className.charAt(0).toLowerCase() + className.slice(1)
}

/** Timezone-safe `new Date(y, m, d)` source for an ISO calendar date. */
function dateCtorFromIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `new Date(${y}, ${(m ?? 1) - 1}, ${d ?? 1})`
}

function renderArg(arg: FlowArg): string {
  if (arg.fromFill && resolveTestData(arg.element, arg.value, getTestData()).useEnvVar) {
    return renderFillValueExpr(arg.element, arg.value)
  }
  switch (arg.type) {
    case 'boolean':
      return arg.value
    case 'number':
      return String(Number.isFinite(Number(arg.value)) ? Number(arg.value) : 0)
    case 'date':
      return arg.isoDate ? dateCtorFromIso(arg.isoDate) : 'new Date()'
    default:
      return JSON.stringify(arg.value)
  }
}

function renderInline(page: IRPage): string[] {
  return page.steps.map((step) => renderStepInSpec(step, INDENT)).filter(Boolean)
}

function renderItem(item: FlowItem): string[] {
  switch (item.kind) {
    case 'visit':
      return [`${INDENT}await page.goto(${JSON.stringify(item.url)});`]
    case 'call': {
      const args = item.args.map(renderArg).join(', ')
      return [`${INDENT}await ${toVarName(item.page.className)}.${item.method.name}(${args});`]
    }
    case 'inline':
      return renderInline(item.page)
  }
}

export function renderScenario(scenario: IRScenario): string {
  const flow = buildScenarioFlow(scenario)
  const used = pagesUsed(flow)

  // The spec lives in tests/ and the page objects in pages/ (see resolveOutputPath).
  const imports = used.map((p) => `import { ${p.className} } from '../pages/${p.className}';`)
  const start = initialUrl(scenario, flow)
  const opening = start ? [`${INDENT}await page.goto(${JSON.stringify(start)});`] : []
  const pageObjects = used.map(
    (p) => `${INDENT}const ${toVarName(p.className)} = new ${p.className}(page);`,
  )
  const body = [...opening, ...pageObjects, ...flow.flatMap(renderItem)].join('\n')

  const header = ["import { test, expect } from '@playwright/test';", ...imports].join('\n')

  return `${header}

test.describe('${scenario.name}', () => {
  test('full flow', async ({ page }) => {
${body}
  });
});
`
}
