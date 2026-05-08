import type { IRScenario, IRStep, AssertionDetail } from '../../ir/types'
import { renderLocator } from './locator'

function renderAssertion(d: AssertionDetail, chain: string, indent: string): string {
  switch (d.type) {
    case 'visible':
      return `${indent}${chain}.should('be.visible');`
    case 'hidden':
      return `${indent}${chain}.should('not.be.visible');`
    case 'text':
      return `${indent}${chain}.should('have.text', ${JSON.stringify(d.expected ?? '')});`
    case 'value':
      return `${indent}${chain}.should('have.value', ${JSON.stringify(d.expected ?? '')});`
    case 'attribute':
      return `${indent}${chain}.should('have.attr', ${JSON.stringify(d.attribute ?? '')}, ${JSON.stringify(d.expected ?? '')});`
    case 'count':
      return `${indent}${chain}.should('have.length', ${Number(d.expected ?? 0)});`
  }
}

function renderStepInSpec(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}cy.visit(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}${renderLocator(step.element)}.click();`
  }
  if (step.action === 'fill' && step.element) {
    return `${indent}${renderLocator(step.element)}.clear().type(${JSON.stringify(step.value ?? '')});`
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}cy.focused().type(${JSON.stringify(`{${step.key.toLowerCase()}}`)});`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail && step.element) {
      return renderAssertion(step.assertionDetail, renderLocator(step.element), indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  return ''
}

export function renderScenario(scenario: IRScenario): string {
  const imports = scenario.pages
    .map((p) => `import { ${p.className} } from '../pages/${p.className}';`)
    .join('\n')

  const testBody = scenario.pages
    .flatMap((page) => page.steps.map((step) => renderStepInSpec(step, '    ')).filter(Boolean))
    .join('\n')

  return `${imports}

describe('${scenario.name}', () => {
  it('full flow', () => {
${testBody}
  });
});
`
}
