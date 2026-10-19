import type { FrameworkId } from '@shared/types/generated'
import { resolveOutputDirs, type OutputDirOverrides } from './output-layout'

/** A flow's test class is `<Flow>Test.java`; `Test<Flow>.java` is the older spelling. */
function isJavaTestClass(filename: string): boolean {
  if (!filename.endsWith('.java') || filename.endsWith('Page.java')) return false
  return filename.endsWith('Test.java') || filename.startsWith('Test')
}

const ROOT_FILES = new Set([
  'package.json',
  'playwright.config.ts',
  'cypress.config.js',
  'tsconfig.json',
  'requirements.txt',
  'conftest.py',
  'pytest.ini',
  'pom.xml',
  'testng.xml',
  '.gitignore',
  'bddgen.config.ts',
])

/**
 * Where a generated file lives in a project, relative to its root. The ZIP export and the CLI
 * both write through this table, so an import path in a spec resolves the same way in either.
 * `overrides` relocates the page-object, test and feature folders (the CLI's `paths` setting).
 */
export function resolveOutputPath(
  filename: string,
  framework: FrameworkId | string,
  overrides?: OutputDirOverrides,
): string {
  // Already-namespaced paths (e.g. cypress/support/e2e.js) pass through as-is
  if (filename.includes('/')) return filename
  // Top-level config files are kept at root
  if (ROOT_FILES.has(filename)) return filename

  const dirs = resolveOutputDirs(framework, overrides)

  if (framework === 'cypress') {
    // cypress-cucumber-preprocessor convention: feature at `<features>/<name>.feature`
    // and step file co-located in a folder of the same basename.
    if (filename.endsWith('.feature')) return `${dirs.features}/${filename}`
    if (filename.endsWith('.steps.js')) {
      const base = filename.replace(/\.steps\.js$/, '')
      return `${dirs.features}/${base}/${filename}`
    }
    if (filename.endsWith('.cy.js')) return `${dirs.tests}/${filename}`
    if (filename.endsWith('.js')) return `${dirs.pages}/${filename}`
    return filename
  }

  if (framework === 'selenium-java') {
    // BDD: .feature lives under Maven test resources; runners/steps live in
    // their own packages under src/test/java; JUnit Platform properties stays
    // at the test-resources root.
    if (filename.endsWith('.feature')) return `${dirs.features}/${filename}`
    if (filename === 'junit-platform.properties') return `src/test/resources/${filename}`
    if (filename === 'StepDefinitions.java') return `src/test/java/steps/${filename}`
    if (filename === 'CucumberRunner.java') return `src/test/java/runners/${filename}`
    if (isJavaTestClass(filename)) return `${dirs.tests}/${filename}`
    if (filename.endsWith('.java')) return `${dirs.pages}/${filename}`
    return filename
  }

  // BDD output routing for the remaining frameworks (Playwright TS, Selenium Python).
  if (filename.endsWith('.feature')) return `${dirs.features}/${filename}`
  if (filename.endsWith('.steps.ts')) return `${dirs.features}/steps/${filename}`

  if (framework === 'selenium-py') {
    if (filename.startsWith('test_') && filename.endsWith('.py')) {
      return `${dirs.tests}/${filename}`
    }
    if (filename.endsWith('.py')) return `${dirs.pages}/${filename}`
    return filename
  }

  // Playwright (default)
  if (filename.endsWith('.spec.ts')) return `${dirs.tests}/${filename}`
  if (filename.endsWith('.ts')) return `${dirs.pages}/${filename}`
  return filename
}
