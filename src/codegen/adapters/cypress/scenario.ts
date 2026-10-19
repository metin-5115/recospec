import type { IRScenario, IRStep } from '../../ir/types'
import { renderLocator } from './locator'
import { renderAssertion } from './assertion'
import { renderInteraction } from './interaction'
import { renderCypressMocks } from './mock'
import { resolveTestData } from '../../planner/test-data-resolver'
import { renderFillValueExpr } from './fill-value'
import type { RenderOptions } from '../registry'
import { dateCtorFromIso } from '../../shared/date-literal'
import {
  buildScenarioFlow,
  initialUrl,
  pagesUsed,
  type FlowArg,
  type FlowItem,
} from '../../shared/scenario-flow'

function renderWait(step: IRStep, indent: string): string {
  if (!step.wait) return ''
  const timeout = step.wait.timeoutMs
  if (step.wait.reason === 'networkidle') {
    return [
      `${indent}cy.intercept('**/*').as('netReq');`,
      `${indent}cy.wait('@netReq', { timeout: ${timeout} });`,
    ].join('\n')
  }
  if (step.wait.reason === 'spinner' || step.wait.reason === 'element-hidden') {
    if (!step.element) return ''
    return `${indent}${renderLocator(step.element)}.should('not.exist');`
  }
  if (step.wait.reason === 'element-visible' && step.element) {
    return `${indent}${renderLocator(step.element)}.should('be.visible');`
  }
  return ''
}

function renderStepInSpec(step: IRStep, indent: string, options: RenderOptions): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}cy.visit(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}${renderLocator(step.element)}.click();`
  }
  if (step.action === 'fill' && step.element) {
    const expr = renderFillValueExpr(step.element, step.value ?? '', options.testData)
    return `${indent}${renderLocator(step.element)}.clear().type(${expr});`
  }
  if (step.element) {
    const interaction = renderInteraction(step, renderLocator(step.element), indent)
    if (interaction) return interaction
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}cy.focused().type(${JSON.stringify(`{${step.key.toLowerCase()}}`)});`
  }
  if (step.action === 'wait') {
    return renderWait(step, indent)
  }
  if (step.action === 'assert') {
    if (step.assertionDetail) {
      const chain =
        step.assertionDetail.type === 'screenshot' || !step.element
          ? 'cy'
          : renderLocator(step.element)
      return renderAssertion(step.assertionDetail, chain, indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  return ''
}

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

function renderItem(item: FlowItem, options: RenderOptions): string[] {
  switch (item.kind) {
    case 'visit':
      return [`${INDENT}cy.visit(${JSON.stringify(item.url)});`]
    case 'call': {
      const args = item.args.map((a) => renderArg(a, options)).join(', ')
      return [`${INDENT}${toVarName(item.page.className)}.${item.method.name}(${args});`]
    }
    case 'inline':
      return item.page.steps.map((step) => renderStepInSpec(step, INDENT, options)).filter(Boolean)
  }
}

export function renderScenario(scenario: IRScenario, options: RenderOptions = {}): string {
  const flow = buildScenarioFlow(scenario)
  const used = pagesUsed(flow)

  // Spec in cypress/e2e/, page objects in cypress/pages/ (see resolveOutputPath).
  const imports = used.map((p) => `import { ${p.className} } from '../pages/${p.className}';`)
  const header = imports.length > 0 ? `${imports.join('\n')}\n\n` : ''

  // Page-object methods register their own mocks; only inline pages need them here, and
  // before any step: an intercept registered after the click would miss the request.
  const inlineSteps = flow.flatMap((item) => (item.kind === 'inline' ? item.page.steps : []))
  const mocks = renderCypressMocks(inlineSteps, INDENT, options)
  const start = initialUrl(scenario, flow)
  const opening = start ? [`${INDENT}cy.visit(${JSON.stringify(start)});`] : []
  const pageObjects = used.map(
    (p) => `${INDENT}const ${toVarName(p.className)} = new ${p.className}();`,
  )
  const testBody = [
    mocks,
    ...opening,
    ...pageObjects,
    ...flow.flatMap((item) => renderItem(item, options)),
  ]
    .filter(Boolean)
    .join('\n')

  return `${header}describe('${scenario.name}', () => {
  it('full flow', () => {
${testBody}
  });
});
`
}
