import type { GeneratedFile } from '@shared/types/generated'
import type { IRScenario, IRPage } from '../../ir/types'
import {
  mapScenarioToGherkin,
  literalArgsFor,
  UPLOAD_FILE_SEPARATOR,
  type GherkinStep,
} from '../../bdd/gherkin-mapper'
import { UPLOAD_FIXTURES_DIR } from '../../shared/upload-fixtures'

export { renderFeatureFile } from '../../bdd/feature-file'
import { toPyIdentifier, toSnakeCase } from './naming'
import { flowSlug } from '../../shared/flow-slug'
import { dottedModule, relativeModule, resolveOutputDirs } from '../../export/output-layout'
import type { RenderOptions } from '../registry'

// ---------------------------------------------------------------------------
// Cucumber pattern → pytest-bdd `parse` / `cfparse` pattern
//
// Mapping per the design:
//   {string}  → "{argN}"   (matches a quoted literal; arg type is `str`)
//   {int}     → {argN:d}   (typed via cfparse; arg type is `int`)
//   {float}   → {argN:f}   (typed via cfparse; arg type is `float`)
//
// Booleans are emitted by the mapper as `{string}` already, so they stay `str`.
// ---------------------------------------------------------------------------

interface ConvertedPattern {
  /** The pytest-bdd pattern string (without enclosing quotes). */
  pattern: string
  /** Generated argument names in left-to-right order. */
  argNames: string[]
  /** Python types for each argument (used in the cast site, not the signature). */
  argTypes: Array<'str' | 'int' | 'float'>
  /** True when at least one placeholder needs cfparse (i.e. has a format spec). */
  needsCfParse: boolean
}

function convertPattern(cucumberPattern: string): ConvertedPattern {
  const argNames: string[] = []
  const argTypes: Array<'str' | 'int' | 'float'> = []
  let needsCfParse = false
  let idx = 0
  const pattern = cucumberPattern.replace(/\{(string|int|float)\}/g, (_match, t: string) => {
    idx++
    const name = `arg${idx}`
    argNames.push(name)
    if (t === 'int') {
      argTypes.push('int')
      needsCfParse = true
      return `{${name}:d}`
    }
    if (t === 'float') {
      argTypes.push('float')
      needsCfParse = true
      return `{${name}:f}`
    }
    argTypes.push('str')
    return `"{${name}}"`
  })
  return { pattern, argNames, argTypes, needsCfParse }
}

// ---------------------------------------------------------------------------
// Step body rendering
// ---------------------------------------------------------------------------

function pomVarName(page: IRPage): string {
  // LoginPage → login_page (Python idiomatic local-variable name)
  return toSnakeCase(page.className)
}

/** Recorded steps that need no step-definition code of their own. */
const NO_OP_ACTIONS = new Set(['wait', 'network'])

function renderStepBody(step: GherkinStep, argNames: string[]): string {
  const page = step.page
  const method = step.method
  const sourceAction = step.sourceSteps[0]?.action

  if (page && method) {
    const pomName = pomVarName(page)
    const args = [...argNames, ...literalArgsFor(step, argNames.length, 'python')].join(', ')
    return [
      `    ${pomName} = ${page.className}(driver)`,
      `    ${pomName}.${toPyIdentifier(method.name)}(${args})`,
    ].join('\n')
  }

  if (sourceAction === 'navigate' && page) {
    const pomName = pomVarName(page)
    return [`    ${pomName} = ${page.className}(driver)`, `    ${pomName}.goto()`].join('\n')
  }

  if (sourceAction === 'click') {
    const ref = argNames[0] ?? '""'
    return [
      `    _xpath = "//*[normalize-space()='" + ${ref} + "']"`,
      `    driver.find_element(By.XPATH, _xpath).click()`,
    ].join('\n')
  }
  if (sourceAction === 'fill') {
    const labelRef = argNames[0] ?? '""'
    const valueRef = argNames[1] ?? '""'
    return [
      `    _xpath = "//*[@aria-label='" + ${labelRef} + "' or @placeholder='" + ${labelRef} + "']"`,
      `    _el = driver.find_element(By.XPATH, _xpath)`,
      `    _el.clear()`,
      `    _el.send_keys(${valueRef})`,
    ].join('\n')
  }
  if (sourceAction === 'select') {
    const valueRef = argNames[0] ?? '""'
    const labelRef = argNames[1] ?? '""'
    return [
      `    _xpath = "//*[@aria-label='" + ${labelRef} + "' or @name='" + ${labelRef} + "']"`,
      `    Select(driver.find_element(By.XPATH, _xpath)).select_by_value(${valueRef})`,
    ].join('\n')
  }
  if (sourceAction === 'check' || sourceAction === 'uncheck') {
    const labelRef = argNames[0] ?? '""'
    const condition = sourceAction === 'check' ? 'not _el.is_selected()' : '_el.is_selected()'
    return [
      `    _xpath = "//*[@aria-label='" + ${labelRef} + "' or @name='" + ${labelRef} + "']"`,
      `    _el = driver.find_element(By.XPATH, _xpath)`,
      `    if ${condition}:`,
      `        _el.click()`,
    ].join('\n')
  }
  if (sourceAction === 'upload') {
    const filesRef = argNames[0] ?? '""'
    const labelRef = argNames[1] ?? '""'
    return [
      `    _xpath = "//*[@aria-label='" + ${labelRef} + "' or @name='" + ${labelRef} + "']"`,
      `    _paths = [os.path.abspath(os.path.join('${UPLOAD_FIXTURES_DIR}', f)) for f in ${filesRef}.split(${JSON.stringify(UPLOAD_FILE_SEPARATOR)})]`,
      `    driver.find_element(By.XPATH, _xpath).send_keys('\\n'.join(_paths))`,
    ].join('\n')
  }
  if (sourceAction === 'hover' || sourceAction === 'dblclick') {
    const textRef = argNames[0] ?? '""'
    const call = sourceAction === 'hover' ? 'move_to_element(_el)' : 'double_click(_el)'
    return [
      `    _xpath = "//*[normalize-space()='" + ${textRef} + "']"`,
      `    _el = driver.find_element(By.XPATH, _xpath)`,
      `    ActionChains(driver).${call}.perform()`,
    ].join('\n')
  }
  if (sourceAction === 'keypress') {
    const keyRef = argNames[0] ?? '""'
    return `    driver.switch_to.active_element.send_keys(getattr(Keys, ${keyRef}.upper()))`
  }
  if (sourceAction === 'assert') {
    const textRef = argNames[0] ?? '""'
    return [
      `    _xpath = "//*[contains(normalize-space(), '" + ${textRef} + "')]"`,
      `    assert driver.find_element(By.XPATH, _xpath).is_displayed()`,
    ].join('\n')
  }
  if (sourceAction && NO_OP_ACTIONS.has(sourceAction)) {
    return `    pass  # No-op: ${sourceAction} steps are covered by the explicit waits.`
  }
  return `    raise NotImplementedError(${JSON.stringify(`Unsupported recorded step: ${sourceAction ?? 'unknown'}`)})`
}

// ---------------------------------------------------------------------------
// Steps file renderer
// ---------------------------------------------------------------------------

/**
 * pytest-bdd exposes `@given/@when/@then` decorators — `And` lines in the
 * feature are Gherkin sugar; the registration must use the canonical keyword
 * of the preceding step. We pick it from the text shape (same heuristic as
 * the Playwright/Cypress adapters).
 */
function canonicalDecorator(step: GherkinStep): 'given' | 'when' | 'then' {
  if (step.keyword !== 'And') {
    return step.keyword.toLowerCase() as 'given' | 'when' | 'then'
  }
  const text = step.text.toLowerCase()
  if (text.startsWith('i am on ')) return 'given'
  if (text.startsWith('the ') || text.startsWith('i should ') || text.startsWith('i verify ')) {
    return 'then'
  }
  return 'when'
}

export function renderStepsFile(scenario: IRScenario, options: RenderOptions = {}): string {
  const feature = mapScenarioToGherkin(scenario)
  const seenPatterns = new Set<string>()
  const stepDefs: string[] = []
  const pomImports = new Set<string>()
  let stepCounter = 0

  for (const sc of feature.scenarios) {
    for (const step of sc.steps) {
      if (seenPatterns.has(step.pattern)) continue
      seenPatterns.add(step.pattern)

      if (step.page) pomImports.add(step.page.className)

      const conv = convertPattern(step.pattern)
      const parserCall = conv.needsCfParse ? 'parsers.cfparse' : 'parsers.parse'
      const decorator = canonicalDecorator(step)
      stepCounter++
      const fnName = `_step_${stepCounter}`
      const fnArgs = ['driver', ...conv.argNames].join(', ')
      const body = renderStepBody(step, conv.argNames)

      stepDefs.push(
        `@${decorator}(${parserCall}(${JSON.stringify(conv.pattern)}))\n` +
          `def ${fnName}(${fnArgs}):\n${body}`,
      )
    }
  }

  // Layout (matches zip-export routing):
  //   features/<slug>.feature
  //   tests/test_<slug>.py      ← this file
  //   pages/<snake>.py
  // From tests/test_<slug>.py:
  //   ../features/<slug>.feature
  //   ../pages/<snake>
  const dirs = resolveOutputDirs('selenium-py', options.dirs)
  const importLines: string[] = ['from pytest_bdd import scenarios, given, when, then, parsers']
  importLines.push('from selenium.webdriver.common.by import By')
  importLines.push('from selenium.webdriver.common.keys import Keys')
  const stepsText = stepDefs.join('\n')
  if (/\bos\.path\b/.test(stepsText)) importLines.unshift('import os')
  if (/\bSelect\(/.test(stepsText)) {
    importLines.push('from selenium.webdriver.support.ui import Select')
  }
  if (/\bActionChains\(/.test(stepsText)) {
    importLines.push('from selenium.webdriver.common.action_chains import ActionChains')
  }
  if (pomImports.size > 0) {
    for (const name of Array.from(pomImports).sort()) {
      importLines.push(`from ${dottedModule(dirs.pages)}.${toSnakeCase(name)} import ${name}`)
    }
  }

  const head = importLines.join('\n')
  const featurePath = relativeModule(
    dirs.tests,
    dirs.features,
    `${flowSlug(scenario.name)}.feature`,
  )
  const scenariosLine = `scenarios('${featurePath}')`

  return `${head}

${scenariosLine}


${stepDefs.join('\n\n\n')}
`
}

// ---------------------------------------------------------------------------
// BDD-specific scaffold (overrides requirements.txt)
// ---------------------------------------------------------------------------

const REQUIREMENTS_TXT_BDD = `selenium>=4.15.0
pytest>=7.4.0
pytest-bdd>=7.0.0
pytest-html>=4.1.0
webdriver-manager>=4.0.0
python-dotenv>=1.0.0
Pillow>=10.0.0
`

export function renderBddScaffoldFiles(): GeneratedFile[] {
  // requirements.txt is also emitted by the vanilla scaffold; the orchestrator
  // dedupes by filename with last-wins semantics, so this override takes effect.
  return [{ filename: 'requirements.txt', content: REQUIREMENTS_TXT_BDD }]
}
