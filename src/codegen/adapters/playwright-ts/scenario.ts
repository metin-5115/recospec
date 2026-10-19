import type { IRPage, IRScenario } from '../../ir/types'
import {
  buildScenarioFlow,
  initialUrl,
  pagesUsed,
  type FlowArg,
  type FlowItem,
} from '../../shared/scenario-flow'
import { dateCtorFromIso } from '../../shared/date-literal'
import { resolveTestData } from '../../planner/test-data-resolver'
import { renderStepInSpec } from './step'
import { renderFillValueExpr } from './fill-value'
import type { RenderOptions } from '../registry'

const INDENT = '    '

function toVarName(className: string): string {
  return className.charAt(0).toLowerCase() + className.slice(1)
}

function renderArg(arg: FlowArg, options: RenderOptions): string {
  if (arg.fromFill && resolveTestData(arg.element, arg.value, options.testData).useEnvVar) {
    return renderFillValueExpr(arg.element, arg.value, options.testData)
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

function renderInline(page: IRPage, options: RenderOptions): string[] {
  return page.steps.map((step) => renderStepInSpec(step, INDENT, options)).filter(Boolean)
}

function renderItem(item: FlowItem, options: RenderOptions): string[] {
  switch (item.kind) {
    case 'visit':
      return [`${INDENT}await page.goto(${JSON.stringify(item.url)});`]
    case 'call': {
      const args = item.args.map((a) => renderArg(a, options)).join(', ')
      return [`${INDENT}await ${toVarName(item.page.className)}.${item.method.name}(${args});`]
    }
    case 'inline':
      return renderInline(item.page, options)
  }
}

export function renderScenario(scenario: IRScenario, options: RenderOptions = {}): string {
  const flow = buildScenarioFlow(scenario)
  const used = pagesUsed(flow)

  // The spec lives in tests/ and the page objects in pages/ (see resolveOutputPath).
  const imports = used.map((p) => `import { ${p.className} } from '../pages/${p.className}';`)
  const start = initialUrl(scenario, flow)
  const opening = start ? [`${INDENT}await page.goto(${JSON.stringify(start)});`] : []
  const pageObjects = used.map(
    (p) => `${INDENT}const ${toVarName(p.className)} = new ${p.className}(page);`,
  )
  const body = [
    ...opening,
    ...pageObjects,
    ...flow.flatMap((item) => renderItem(item, options)),
  ].join('\n')

  const header = ["import { test, expect } from '@playwright/test';", ...imports].join('\n')

  return `${header}

test.describe('${scenario.name}', () => {
  test('full flow', async ({ page }) => {
${body}
  });
});
`
}
