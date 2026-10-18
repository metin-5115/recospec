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
import { resolveOutputPath } from './export/output-path'
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
    adapter.renderScenario({
      name: payload.session.name,
      startUrl: payload.session.startUrl,
      pages,
    }),
  ]
}

function source(files: GeneratedFile[]): string {
  return files.map((f) => f.content).join('\n')
}

/** Generated files keyed by the path they get in a project (same table the ZIP and the CLI use). */
function projectLayout(files: GeneratedFile[], framework: FrameworkId): Record<string, string> {
  return Object.fromEntries(files.map((f) => [resolveOutputPath(f.filename, framework), f.content]))
}

function startUrlOf(recording: unknown): string {
  return (JSON.parse(JSON.stringify(recording)) as JsonExportPayload).session.startUrl
}

/** Routes the user actually interacted on, in order. Waits and network calls only report where the page ended up. */
function recordedRoutes(recording: unknown): string[] {
  const payload = JSON.parse(JSON.stringify(recording)) as JsonExportPayload
  const routes: string[] = []
  for (const action of payload.actions) {
    if (action.type === 'wait' || action.type === 'network') continue
    const route = new URL(action.pageUrl).pathname
    if (!routes.includes(route)) routes.push(route)
  }
  return routes
}

/** Splits `a, "b, c", f(d, e)` on its top-level commas. */
function topLevelArgs(text: string): string[] {
  const args: string[] = []
  let depth = 0
  let quote = ''
  let current = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string
    if (quote) {
      current += ch
      if (ch === '\\') current += text[++i] ?? ''
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    if ('([{'.includes(ch)) depth++
    if (')]}'.includes(ch)) depth--
    if (ch === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) args.push(current.trim())
  return args
}

/** Every `receiver.method(args)` call, with the argument count. Strings may contain parentheses. */
function callsOn(code: string, receiver: string): { method: string; argCount: number }[] {
  const calls: { method: string; argCount: number }[] = []
  const opener = new RegExp(`\\b${receiver}\\.(\\w+)\\(`, 'g')
  for (let m = opener.exec(code); m; m = opener.exec(code)) {
    let depth = 1
    let quote = ''
    let i = opener.lastIndex
    const start = i
    for (; i < code.length && depth > 0; i++) {
      const ch = code[i] as string
      if (quote) {
        if (ch === '\\') i++
        else if (ch === quote) quote = ''
        continue
      }
      if (ch === '"' || ch === "'") quote = ch
      else if (ch === '(') depth++
      else if (ch === ')') depth--
    }
    calls.push({
      method: m[1] as string,
      argCount: topLevelArgs(code.slice(start, i - 1)).length,
    })
  }
  return calls
}

/** Parameter counts of the methods a generated page-object class declares. */
function declaredMethods(content: string, signature: RegExp): Map<string, number> {
  const methods = new Map<string, number>()
  for (const m of content.matchAll(signature)) {
    methods.set(m[1] as string, topLevelArgs(m[2] ?? '').length)
  }
  return methods
}

/**
 * The spec must call page-object methods that exist, with as many arguments as they take.
 * `variable(className)` is how the adapter names the page-object instance in the spec.
 */
function expectCallsMatchDeclarations(
  files: GeneratedFile[],
  spec: GeneratedFile,
  signature: RegExp,
  variable: (className: string, filename: string) => string,
  classOf: (file: GeneratedFile) => string | undefined,
): void {
  let called = 0
  for (const file of files) {
    if (file === spec) continue
    const className = classOf(file)
    if (!className) continue
    const declared = declaredMethods(file.content, signature)
    for (const call of callsOn(spec.content, variable(className, file.filename))) {
      called++
      expect(declared.has(call.method), `${className}.${call.method} is not declared`).toBe(true)
      expect(call.argCount, `${className}.${call.method} argument count`).toBe(
        declared.get(call.method),
      )
    }
  }
  expect(called, 'the spec calls page-object methods').toBeGreaterThan(0)
}

function classNameIn(file: GeneratedFile): string | undefined {
  return file.content.match(/class (\w+)/)?.[1]
}

function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1)
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

  it('Playwright output type-checks against @playwright/test in the project layout', () => {
    const files = render(recording, 'playwright-ts')
    expect(source(files)).not.toMatch(/getByRole\((?!["'])/)
    const layout = projectLayout(files, 'playwright-ts')
    expect(Object.keys(layout)).toContain('tests/scenario.spec.ts')
    expect(typeErrors(layout)).toEqual([])
  }, 30_000)

  describe('Playwright scenario', () => {
    const files = () => render(recording, 'playwright-ts')
    const spec = () => files().find((f) => f.filename === 'scenario.spec.ts') as GeneratedFile

    it('imports page objects from where the project layout puts them', () => {
      const imports = [...spec().content.matchAll(/from '([^']+)'/g)].map((m) => m[1])
      const pageImports = imports.filter((i) => i !== '@playwright/test')
      expect(pageImports.length).toBeGreaterThan(0)
      for (const path of pageImports) expect(path).toMatch(/^\.\.\/pages\/\w+Page$/)
    })

    it('drives the flow through page-object methods instead of inline locators', () => {
      const all = files()
      const code = spec().content
      expect(code).not.toMatch(/\bpage\.(getBy|locator)\w*\(/)
      expectCallsMatchDeclarations(
        all,
        spec(),
        /^ {2}async (\w+)\(([^)]*)\)/gm,
        (className) => lowerFirst(className),
        classNameIn,
      )
      expect(code).toMatch(/const \w+Page = new \w+Page\(page\);/)
    })

    it('opens the recorded start URL first', () => {
      const body = spec().content.split("test('full flow'")[1] as string
      const firstStatement = body.split('\n').find((l) => l.includes('await '))
      expect(firstStatement?.trim()).toBe(
        `await page.goto(${JSON.stringify(startUrlOf(recording))});`,
      )
    })

    it('points each page object at the route it was recorded on', () => {
      const gotos = files()
        .filter((f) => f.filename !== 'scenario.spec.ts')
        .map((f) => f.content.match(/async goto\(\) \{\s*await this\.page\.goto\(("[^"]*")\)/)?.[1])
      expect(gotos.map((g) => g && JSON.parse(g))).toEqual(recordedRoutes(recording))
    })

    it('leaves waiting to Playwright auto-wait instead of networkidle', () => {
      expect(source(files())).not.toContain('networkidle')
    })
  })

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
