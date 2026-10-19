import type { FrameworkId } from '@shared/types/generated'

export interface FrameworkConvention {
  label: string
  runCommand: string
  /** Idiomatic env-var lookup, rendered with a generic `X` placeholder. */
  envLookup: string
  pageObjectPath: (className: string) => string
  scenarioPath: (slug: string) => string
  rules: string[]
}

function pascalCase(slug: string): string {
  return slug
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function snakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase()
}

export const FRAMEWORK_CONVENTIONS: Record<FrameworkId, FrameworkConvention> = {
  'playwright-ts': {
    label: 'Playwright (TypeScript)',
    runCommand: 'npx playwright test',
    envLookup: 'process.env.X ?? "change-me"',
    pageObjectPath: (className) => `pages/${className}.ts`,
    scenarioPath: (slug) => `tests/${slug}.spec.ts`,
    rules: [
      'Page objects are TypeScript classes taking `page: Page`; expose locators as getters.',
      'Use `getByLabel`/`getByRole`/`getByTestId` for the matching strategies; raw `page.locator` only for css/xpath.',
      'Use web-first assertions (`await expect(locator).toBeVisible()`); never `waitForTimeout`.',
    ],
  },
  cypress: {
    label: 'Cypress (JavaScript)',
    runCommand: 'npx cypress run',
    envLookup: 'Cypress.env("X") || "change-me"',
    pageObjectPath: (className) => `cypress/pages/${className}.js`,
    scenarioPath: (slug) => `cypress/e2e/${slug}.cy.js`,
    rules: [
      'Page objects are plain classes returning Cypress chains; no async/await.',
      'Prefer `cy.get("[data-testid=…]")`/`cy.contains` for the matching strategies; use `cy.selfHealing` for elements with fallbacks.',
      'Rely on Cypress retry-ability; never `cy.wait(<number>)`.',
    ],
  },
  'selenium-py': {
    label: 'Selenium Python (pytest)',
    runCommand: 'pytest',
    envLookup: "os.environ.get('X', 'change-me')",
    pageObjectPath: (className) => `pages/${snakeCase(className)}.py`,
    scenarioPath: (slug) => `tests/test_${snakeCase(slug)}.py`,
    rules: [
      'Page objects are classes with `(By.<STRATEGY>, "<value>")` constants and a `WebDriverWait` in `__init__`.',
      'Tests are pytest functions taking the `driver` fixture; follow PEP 8 snake_case names.',
      'Use explicit waits (`WebDriverWait` + `expected_conditions`); never `time.sleep`.',
    ],
  },
  'selenium-java': {
    label: 'Selenium Java (TestNG)',
    runCommand: 'mvn test',
    envLookup: 'System.getenv().getOrDefault("X", "change-me")',
    pageObjectPath: (className) => `src/main/java/pages/${className}.java`,
    scenarioPath: (slug) => `src/test/java/tests/${pascalCase(slug)}Test.java`,
    rules: [
      'Page objects use `@FindBy` fields initialised with `PageFactory.initElements(driver, this)`.',
      'Tests are TestNG classes with `@BeforeMethod`/`@Test`/`@AfterMethod`; use `WebDriverWait`, never `Thread.sleep`.',
      'Escape Java reserved words and leading digits in field names with a `_` prefix.',
    ],
  },
}

export const GENERIC_CONVENTION: FrameworkConvention = {
  label: "the project's existing test framework",
  runCommand: "the project's test command",
  envLookup: 'the idiomatic environment-variable lookup with a "change-me" fallback',
  pageObjectPath: (className) => `pages/${className}`,
  scenarioPath: (slug) => `tests/${slug}`,
  rules: [
    "Detect the framework from the project's manifests and follow its existing page-object and test layout.",
  ],
}

export function getFrameworkConvention(framework: FrameworkId | undefined): FrameworkConvention {
  return framework ? FRAMEWORK_CONVENTIONS[framework] : GENERIC_CONVENTION
}
