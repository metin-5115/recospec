import type { IRPage, IRScenario } from '../../ir/types'
import {
  buildScenarioFlow,
  initialUrl,
  pagesUsed,
  recordedOrigin,
  routeWithin,
  type FlowArg,
  type FlowItem,
} from '../../shared/scenario-flow'
import { dateCtorFromIso } from '../../shared/date-literal'
import { resolveTestData } from '../../planner/test-data-resolver'
import { mocksFirst, renderStepInSpec } from './step'
import { renderFillValueExpr } from './fill-value'
import type { RenderOptions } from '../registry'
import { relativeModule, resolveOutputDirs } from '../../export/output-layout'
import { SELF_HEALING_HELPER_DIR } from '@shared/constants'

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
  return mocksFirst(
    page.steps,
    page.steps.map((step) => renderStepInSpec(step, INDENT, options)),
  ).filter(Boolean)
}

function renderItem(item: FlowItem, options: RenderOptions): string[] {
  switch (item.kind) {
    case 'visit':
      return [
        `${INDENT}await page.goto(${JSON.stringify(routeWithin(options.baseUrl, item.url))});`,
      ]
    case 'call': {
      const args = item.args.map((a) => renderArg(a, options)).join(', ')
      return [`${INDENT}await ${toVarName(item.page.className)}.${item.method.name}(${args});`]
    }
    case 'inline':
      return renderInline(item.page, options)
  }
}

export function renderScenario(scenario: IRScenario, given: RenderOptions = {}): string {
  // Routes are written relative to the origin the flow was recorded on, unless the caller pinned one.
  const options: RenderOptions = { ...given, baseUrl: given.baseUrl ?? recordedOrigin(scenario) }
  const flow = buildScenarioFlow(scenario)
  const used = pagesUsed(flow)

  // Page objects are imported from wherever resolveOutputPath puts them relative to the spec.
  const dirs = resolveOutputDirs('playwright-ts', options.dirs)
  const imports = used.map(
    (p) =>
      `import { ${p.className} } from '${relativeModule(dirs.tests, dirs.pages, p.className)}';`,
  )
  const start = initialUrl(scenario, flow)
  const opening = start
    ? [`${INDENT}await page.goto(${JSON.stringify(routeWithin(options.baseUrl, start))});`]
    : []
  const pageObjects = used.map(
    (p) => `${INDENT}const ${toVarName(p.className)} = new ${p.className}(page);`,
  )
  const body = [
    ...opening,
    ...pageObjects,
    ...flow.flatMap((item) => renderItem(item, options)),
  ].join('\n')

  const healingImport = /\bselfHealingLocator\(/.test(body)
    ? [
        `import { selfHealingLocator } from '${relativeModule(dirs.tests, SELF_HEALING_HELPER_DIR, 'locator')}';`,
      ]
    : []
  const header = [
    "import { test, expect } from '@playwright/test';",
    ...healingImport,
    ...imports,
  ].join('\n')

  return `${header}

test.describe('${scenario.name}', () => {
  test('full flow', async ({ page }) => {
${body}
  });
});
`
}
