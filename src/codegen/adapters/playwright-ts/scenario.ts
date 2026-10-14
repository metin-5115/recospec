import type { IRScenario } from '../../ir/types'
import { renderStepInSpec } from './step'

export function renderScenario(scenario: IRScenario): string {
  const imports = scenario.pages
    .map((p) => `import { ${p.className} } from './${p.className}';`)
    .join('\n')

  const testBody = scenario.pages
    .flatMap((page) => page.steps.map((step) => renderStepInSpec(step, '    ')).filter(Boolean))
    .join('\n')

  return `import { test, expect } from '@playwright/test';
${imports}

test.describe('${scenario.name}', () => {
  test('full flow', async ({ page }) => {
${testBody}
  });
});
`
}
