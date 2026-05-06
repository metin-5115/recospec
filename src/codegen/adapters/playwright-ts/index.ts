import type {
  IRPage,
  IRElement,
  IRStep,
  IRScenario,
  InferredMethod,
  GeneratedFile,
  AssertionDetail,
} from '../../ir/types'

// ---------------------------------------------------------------------------
// Locator rendering
// ---------------------------------------------------------------------------

/** Render the inner locator expression relative to its root (page or frame). */
function renderInnerLocator(el: IRElement, root: string): string {
  const val = el.locatorValue
  const strategy = el.locatorStrategy

  if (strategy === 'testid')
    return `${root}.getByTestId(${JSON.stringify(val.replace(/^\[data-testid="(.+)"\]$/, '$1'))})`
  if (strategy === 'aria-label')
    return `${root}.getByLabel(${JSON.stringify(val.replace(/^\[aria-label="(.+)"\]$/, '$1'))})`
  if (strategy === 'role-name') return `${root}.getByRole(${val})`
  if (strategy === 'text') return `${root}.getByText(${JSON.stringify(val)})`
  return `${root}.locator(${JSON.stringify(val)})`
}

function renderLocator(el: IRElement): string {
  // Iframe chain: wrap with frameLocator() calls, outermost first
  let root = 'page'
  if (el.frameContext?.frameChain.length) {
    root = el.frameContext.frameChain.reduce(
      (acc, frame) => `${acc}.frameLocator(${JSON.stringify(frame)})`,
      'page',
    )
  }

  // Shadow DOM: chain .locator() calls through each host, then the inner selector
  if (el.shadowContext?.hostChain.length) {
    const hostChain = el.shadowContext.hostChain
      .map((h) => `locator(${JSON.stringify(h)})`)
      .join('.')
    return `${root}.${hostChain}.locator(${JSON.stringify(el.locatorValue)})`
  }

  return renderInnerLocator(el, root)
}

function renderElementGetter(el: IRElement): string {
  const shadowWarning = el.shadowClosed
    ? `  // WARNING: element is inside a closed shadow root — locator may be unreliable\n`
    : ''
  const primary = `${shadowWarning}  get ${el.name}() { return ${renderLocator(el)}; }`
  if (!el.fallbackLocators?.length) return primary
  const fallbacks = el.fallbackLocators
    .map((f) => `  // fallback: page.locator(${JSON.stringify(f)})`)
    .join('\n')
  return `${primary}\n${fallbacks}`
}

// ---------------------------------------------------------------------------
// Assertion rendering
// ---------------------------------------------------------------------------

function renderAssertionMatcher(d: AssertionDetail, locator: string, indent: string): string {
  switch (d.type) {
    case 'visible':
      return `${indent}await expect(${locator}).toBeVisible();`
    case 'hidden':
      return `${indent}await expect(${locator}).toBeHidden();`
    case 'text':
      return `${indent}await expect(${locator}).toHaveText(${JSON.stringify(d.expected ?? '')});`
    case 'value':
      return `${indent}await expect(${locator}).toHaveValue(${JSON.stringify(d.expected ?? '')});`
    case 'attribute':
      return `${indent}await expect(${locator}).toHaveAttribute(${JSON.stringify(d.attribute ?? '')}, ${JSON.stringify(d.expected ?? '')});`
    case 'count':
      return `${indent}await expect(${locator}).toHaveCount(${Number(d.expected ?? 0)});`
  }
}

// ---------------------------------------------------------------------------
// Step rendering
// ---------------------------------------------------------------------------

function renderStepInMethod(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}await this.page.goto(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}await this.${step.element.name}.click();`
  }
  if (step.action === 'fill' && step.element) {
    return `${indent}await this.${step.element.name}.fill(${JSON.stringify(step.value ?? '')});`
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}await this.page.keyboard.press(${JSON.stringify(step.key)});`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail && step.element) {
      return renderAssertionMatcher(step.assertionDetail, `this.${step.element.name}`, indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  return ''
}

function renderStepInSpec(step: IRStep, indent: string): string {
  if (step.action === 'navigate' && step.url) {
    return `${indent}await page.goto(${JSON.stringify(step.url)});`
  }
  if (step.action === 'click' && step.element) {
    return `${indent}await ${renderLocator(step.element)}.click();`
  }
  if (step.action === 'fill' && step.element) {
    return `${indent}await ${renderLocator(step.element)}.fill(${JSON.stringify(step.value ?? '')});`
  }
  if (step.action === 'keypress' && step.key) {
    return `${indent}await page.keyboard.press(${JSON.stringify(step.key)});`
  }
  if (step.action === 'assert') {
    if (step.assertionDetail && step.element) {
      return renderAssertionMatcher(step.assertionDetail, renderLocator(step.element), indent)
    }
    return `${indent}// assert: ${step.annotation ?? ''}`
  }
  return ''
}

// ---------------------------------------------------------------------------
// Method rendering (inferred)
// ---------------------------------------------------------------------------

function renderInferredMethod(method: InferredMethod): string {
  const paramList = method.params.map((p) => `${p}: string`).join(', ')
  const bodyLines = method.steps
    .map((s) => {
      // For fill steps in inferred methods, use param name instead of hard-coded value
      if (s.action === 'fill' && s.element) {
        const paramIdx = method.params.findIndex(
          (p) =>
            p ===
            s
              .element!.name.replace(/Input$|Button$|Link$|Select$/, '')
              .charAt(0)
              .toLowerCase() +
              s.element!.name.replace(/Input$|Button$|Link$|Select$/, '').slice(1),
        )
        if (paramIdx !== -1) {
          return `    await this.${s.element.name}.fill(${method.params[paramIdx]});`
        }
      }
      return renderStepInMethod(s, '    ')
    })
    .filter(Boolean)
    .join('\n')

  return `  async ${method.name}(${paramList}) {\n${bodyLines}\n  }`
}

// ---------------------------------------------------------------------------
// Page Object
// ---------------------------------------------------------------------------

export function renderPageObject(page: IRPage): string {
  const elementGetters = page.elements.map(renderElementGetter).join('\n\n')

  const gotoStep = page.steps.find((s) => s.action === 'navigate')
  const gotoUrl = gotoStep?.url ?? '/'

  let methodsBlock = ''
  if (page.inferredMethods?.length) {
    methodsBlock = '\n' + page.inferredMethods.map(renderInferredMethod).join('\n\n')
  } else {
    const stepLines = page.steps
      .filter((s) => s.action !== 'navigate')
      .map((s) => renderStepInMethod(s, '    '))
      .filter(Boolean)
      .join('\n')
    if (stepLines) {
      methodsBlock = `\n  async performSteps() {\n${stepLines}\n  }`
    }
  }

  const collisionComment = page.collisionWarning
    ? `  // WARNING: Multiple pages share this URL pattern (${page.normalizedUrl}) with different titles.\n`
    : ''

  return `import { type Page } from '@playwright/test';

export class ${page.className} {
  constructor(private readonly page: Page) {}

${elementGetters}

${collisionComment}  async goto() {
    await this.page.goto(${JSON.stringify(gotoUrl)});
  }
${methodsBlock}
}
`
}

// ---------------------------------------------------------------------------
// Scenario (spec file)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Scaffold (package.json, playwright.config.ts, tsconfig.json)
// ---------------------------------------------------------------------------

export function renderScaffold(): GeneratedFile[] {
  const packageJson = JSON.stringify(
    {
      name: 'playforge-generated-tests',
      version: '1.0.0',
      private: true,
      scripts: {
        test: 'playwright test',
        'test:headed': 'playwright test --headed',
      },
      devDependencies: {
        '@playwright/test': '^1.40.0',
        typescript: '^5.3.0',
      },
    },
    null,
    2,
  )

  const playwrightConfig = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
`

  const tsConfig = JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'commonjs',
        lib: ['ES2022'],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: 'dist',
      },
      include: ['**/*.ts'],
      exclude: ['node_modules', 'dist'],
    },
    null,
    2,
  )

  return [
    { filename: 'package.json', content: packageJson },
    { filename: 'playwright.config.ts', content: playwrightConfig },
    { filename: 'tsconfig.json', content: tsConfig },
  ]
}
