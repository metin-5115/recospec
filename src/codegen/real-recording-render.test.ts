import { describe, it, expect } from 'vitest'
import { normalizeActions } from './normalizer/action-normalizer'
import { groupIntoPages } from './planner/page-grouper'
import { getAdapter } from './adapters/registry'
import './adapters/playwright-ts'
import './adapters/cypress'
import './adapters/selenium-py'
import './adapters/selenium-java'
import { syntaxErrors } from './ts-syntax.test-util'
import { typeErrors } from './ts-typecheck.test-util'
import { validatePythonSource } from './adapters/selenium-py/python-validate'
import { validateJavaSource } from './adapters/selenium-java/java-validate'
import type { JsonExportPayload } from './export/json-export'
import type { FrameworkId, GeneratedFile } from '@shared/types/generated'
import checkoutRecording from './__fixtures__/real-checkout-recording.json'
import loginRecording from './__fixtures__/real-login-recording.json'

/**
 * Renders recordings captured by the real extension through every adapter.
 * Hand-written IR fixtures use a different role-name format than the engine
 * emits, so only real recordings show whether the generated code runs.
 */
const RECORDINGS: Record<string, unknown> = {
  checkout: checkoutRecording,
  login: loginRecording,
}

function render(recording: unknown, framework: FrameworkId): GeneratedFile[] {
  const payload = JSON.parse(JSON.stringify(recording)) as JsonExportPayload
  const pages = groupIntoPages(
    normalizeActions(payload.actions).flatSteps,
    payload.session.startUrl,
  )
  const adapter = getAdapter(framework)
  return [
    ...pages.map((page) => adapter.renderPageObject(page)),
    adapter.renderScenario({ name: payload.session.name, pages }),
  ]
}

function source(files: GeneratedFile[]): string {
  return files.map((f) => f.content).join('\n')
}

/** Every recorded role-name / label value, so each test can check its name survives. */
function recordedNames(recording: unknown): string[] {
  const payload = JSON.parse(JSON.stringify(recording)) as JsonExportPayload
  const names = new Set<string>()
  for (const action of payload.actions) {
    const target = action.target
    if (!target) continue
    for (const loc of [target.primaryLocator, ...(target.fallbackLocators ?? [])]) {
      if (typeof loc.selector !== 'string') continue
      if (loc.strategy === 'label') names.add(loc.selector)
      const roleName = loc.strategy === 'role-name' && loc.selector.match(/\[name="(.*)"\]$/)
      if (roleName) names.add(roleName[1])
    }
  }
  return [...names]
}

describe.each(Object.entries(RECORDINGS))('real %s recording', (_label, recording) => {
  it('records role-name and label locators (the cases this suite guards)', () => {
    expect(recordedNames(recording).length).toBeGreaterThan(0)
  })

  it('Playwright output type-checks against @playwright/test', () => {
    const files = render(recording, 'playwright-ts')
    expect(source(files)).not.toMatch(/getByRole\((?!["'])/)
    const virtual = Object.fromEntries(files.map((f) => [f.filename, f.content]))
    expect(typeErrors(virtual)).toEqual([])
  }, 30_000)

  it('Playwright output queries role-name and label locators by role and label', () => {
    const code = source(render(recording, 'playwright-ts'))
    for (const name of recordedNames(recording)) {
      expect(code).not.toContain(`locator(${JSON.stringify(name)})`)
    }
  })

  it('Cypress output passes testing-library queries real arguments', () => {
    const files = render(recording, 'cypress')
    const code = source(files)
    expect(code).not.toMatch(/findByRole\((?!["'])/)
    for (const name of recordedNames(recording)) {
      expect(code).not.toContain(`cy.get(${JSON.stringify(name)})`)
    }
    for (const f of files) expect(syntaxErrors(f.content, f.filename)).toEqual([])
  })

  it('Selenium Python locators carry the accessible name and parse', () => {
    const files = render(recording, 'selenium-py')
    const code = source(files)
    expect(code).not.toMatch(/By\.XPATH, "\/\/[a-z*]+"\)/)
    for (const name of recordedNames(recording)) {
      expect(code).not.toContain(`By.CSS_SELECTOR, '${name}'`)
    }
    for (const f of files) {
      const result = validatePythonSource(f.content)
      expect(result.ok, `${f.filename}: ${result.error ?? ''}`).toBe(true)
    }
  })

  it('Selenium Java locators carry the accessible name and are well-formed', () => {
    const files = render(recording, 'selenium-java')
    const code = source(files)
    expect(code).not.toMatch(/xpath = "\/\/[a-z*]+"\)/)
    for (const name of recordedNames(recording)) {
      expect(code).not.toContain(`css = "${name}"`)
    }
    for (const f of files) expect(validateJavaSource(f.content).ok).toBe(true)
  })
})
