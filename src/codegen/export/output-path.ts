import type { FrameworkId } from '@shared/types/generated'

/** A flow's test class is `<Flow>Test.java`; `Test<Flow>.java` is the older spelling. */
function isJavaTestClass(filename: string): boolean {
  if (!filename.endsWith('.java') || filename.endsWith('Page.java')) return false
  return filename.endsWith('Test.java') || filename.startsWith('Test')
}

/**
 * Where a generated file lives in a project, relative to its root. The ZIP export and the CLI
 * both write through this table, so an import path in a spec resolves the same way in either.
 */
export function resolveOutputPath(filename: string, framework: FrameworkId | string): string {
  // Already-namespaced paths (e.g. cypress/support/e2e.js) pass through as-is
  if (filename.includes('/')) return filename

  // Top-level config files are kept at root
  if (filename === 'package.json') return filename
  if (filename === 'playwright.config.ts') return filename
  if (filename === 'cypress.config.js') return filename
  if (filename === 'tsconfig.json') return filename
  if (filename === 'requirements.txt') return filename
  if (filename === 'conftest.py') return filename
  if (filename === 'pytest.ini') return filename
  if (filename === 'pom.xml') return filename
  if (filename === 'testng.xml') return filename
  if (filename === '.gitignore') return filename
  if (filename === 'bddgen.config.ts') return filename

  if (framework === 'cypress') {
    // cypress-cucumber-preprocessor convention: feature at `cypress/e2e/<name>.feature`
    // and step file co-located in a folder of the same basename.
    if (filename.endsWith('.feature')) return `cypress/e2e/${filename}`
    if (filename.endsWith('.steps.js')) {
      const base = filename.replace(/\.steps\.js$/, '')
      return `cypress/e2e/${base}/${filename}`
    }
    if (filename.endsWith('.cy.js')) return `cypress/e2e/${filename}`
    if (filename.endsWith('.js')) return `cypress/pages/${filename}`
    return filename
  }

  if (framework === 'selenium-java') {
    // BDD: .feature lives under Maven test resources; runners/steps live in
    // their own packages under src/test/java; JUnit Platform properties stays
    // at the test-resources root.
    if (filename.endsWith('.feature')) return `src/test/resources/features/${filename}`
    if (filename === 'junit-platform.properties') return `src/test/resources/${filename}`
    if (filename === 'StepDefinitions.java') return `src/test/java/steps/${filename}`
    if (filename === 'CucumberRunner.java') return `src/test/java/runners/${filename}`
    if (isJavaTestClass(filename)) return `src/test/java/tests/${filename}`
    if (filename.endsWith('.java')) return `src/main/java/pages/${filename}`
    return filename
  }

  // BDD output routing for the remaining frameworks (Playwright TS).
  if (filename.endsWith('.feature')) return `features/${filename}`
  if (filename.endsWith('.steps.ts')) return `features/steps/${filename}`

  if (framework === 'selenium-py') {
    if (filename.startsWith('test_') && filename.endsWith('.py')) return `tests/${filename}`
    if (filename.endsWith('.py')) return `pages/${filename}`
    return filename
  }

  // Playwright (default)
  if (filename.endsWith('.spec.ts')) return `tests/${filename}`
  if (filename.endsWith('.ts')) return `pages/${filename}`
  return filename
}
