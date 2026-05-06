import type { IRPage, IRElement, IRStep, IRScenario } from '../../ir/types'

function renderLocator(el: IRElement): string {
  const val = el.locatorValue
  const strategy = el.locatorStrategy

  if (strategy === 'testid')
    return `page.getByTestId(${JSON.stringify(val.replace(/^\[data-testid="(.+)"\]$/, '$1'))})`
  if (strategy === 'aria-label')
    return `page.getByLabel(${JSON.stringify(val.replace(/^\[aria-label="(.+)"\]$/, '$1'))})`
  if (strategy === 'role-name') return `page.getByRole(${val})`
  if (strategy === 'text') return `page.getByText(${JSON.stringify(val)})`
  return `page.locator(${JSON.stringify(val)})`
}

function renderStep(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}await page.goto(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}await this.${step.element.name}.click();`
  }
  if (step.action === 'fill' && step.element) {
    return `${indent}await this.${step.element.name}.fill(${JSON.stringify(step.value ?? '')});`
  }
  if (step.action === 'assert') {
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  return ''
}

function renderElementGetter(el: IRElement): string {
  return `  get ${el.name}() { return ${renderLocator(el)}; }`
}

export function renderPageObject(page: IRPage): string {
  const elementGetters = page.elements.map(renderElementGetter).join('\n')

  const stepLines = page.steps
    .filter((s) => s.action !== 'navigate')
    .map((s) => renderStep(s, '    '))
    .filter(Boolean)
    .join('\n')

  const gotoLine = page.steps.find((s) => s.action === 'navigate')
  const gotoUrl = gotoLine?.url ?? '/'

  return `import { type Page } from '@playwright/test';

export class ${page.className} {
  constructor(private readonly page: Page) {}

${elementGetters}

  async goto() {
    await this.page.goto(${JSON.stringify(gotoUrl)});
  }
${stepLines ? `\n  async performSteps() {\n${stepLines}\n  }` : ''}
}
`
}

export function renderScenario(scenario: IRScenario): string {
  const imports = scenario.pages
    .map((p) => `import { ${p.className} } from './${p.className}';`)
    .join('\n')

  const testBody = scenario.pages
    .flatMap((page) => page.steps.map((step) => renderStep(step, '  ')).filter(Boolean))
    .join('\n')

  return `import { test, expect } from '@playwright/test';
${imports}

test('${scenario.name}', async ({ page }) => {
${testBody}
});
`
}
