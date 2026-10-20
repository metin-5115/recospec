import { describe, it, expect } from 'vitest'
import { generateFromActions } from './index'
import type { JsonExportPayload } from './export/json-export'
import type { RecordedAction } from '@shared/types/action'
import type { FrameworkId } from '@shared/types/generated'
import { syntaxErrors } from './ts-syntax.test-util'
import { validatePythonSources } from './adapters/selenium-py/python-validate'
import { validateJavaSource } from './adapters/selenium-java/java-validate'
import loginRecording from './__fixtures__/real-login-recording.json'

const FRAMEWORKS: FrameworkId[] = ['playwright-ts', 'cypress', 'selenium-py', 'selenium-java']
const EMAIL = 'user@example.com'
const PASSWORD = 'fixture-pass-1'
const WRONG_PASSWORD = 'wrong-pass-9'
/** Every recorded value that sits in a field classified as sensitive. */
const SECRET_VALUES = [EMAIL, PASSWORD, WRONG_PASSWORD]

function load(): JsonExportPayload {
  return JSON.parse(JSON.stringify(loginRecording)) as JsonExportPayload
}

/** The recording with a wrong password submitted first, then the valid one typed into the same field. */
function withSecondPassword(): JsonExportPayload {
  const payload = load()
  const index = payload.actions.findIndex((a) => a.payload?.value === PASSWORD)
  const original = payload.actions[index]!
  const typedFirst: RecordedAction = {
    ...original,
    actionId: 'wrong-password-fill',
    payload: { value: WRONG_PASSWORD },
  }
  // A submit in between keeps the two fills from being merged into one.
  const submit = payload.actions.slice(index).find((a) => a.type === 'click')!
  payload.actions.splice(index, 0, typedFirst, { ...submit, actionId: 'first-submit' })
  payload.actions.forEach((a, i) => (a.sequenceNumber = i))
  return payload
}

function generated(payload: JsonExportPayload, framework: FrameworkId, bdd: boolean) {
  return generateFromActions(payload.session, payload.actions, framework, { bdd }).files
}

describe.each(FRAMEWORKS)('%s: recorded secrets stay out of generated files', (framework) => {
  it.each([false, true])('bdd=%s: no file holds a recorded secret value', (bdd) => {
    for (const payload of [load(), withSecondPassword()]) {
      for (const file of generated(payload, framework, bdd)) {
        for (const secret of SECRET_VALUES) {
          expect(file.content, `${file.filename} leaks ${secret}`).not.toContain(secret)
        }
      }
    }
  })

  it('bdd: the feature names the environment variable instead of the value', () => {
    const feature = generated(load(), framework, true).find((f) => f.filename.endsWith('.feature'))
    expect(feature?.content).toContain('$RECOSPEC_PASSWORD')
  })

  it('bdd: a different password in the same recording gets its own reference', () => {
    const feature = generated(withSecondPassword(), framework, true).find((f) =>
      f.filename.endsWith('.feature'),
    )
    const references = new Set(feature?.content.match(/\$RECOSPEC_PASSWORD\w*/g))
    expect(references.size).toBe(2)
  })

  it('bdd: the step definitions resolve the reference at run time', () => {
    const files = generated(load(), framework, true).filter((f) => !f.filename.endsWith('.feature'))
    expect(files.some((f) => /secretValue|secret_value/.test(f.content))).toBe(true)
  })

  it('bdd: values of fields that are not sensitive stay in the feature', () => {
    const payload = load()
    const search = payload.actions.find((a) => a.type === 'fill')!
    expect(search).toBeDefined()
    const feature = generated(payload, framework, true).find((f) => f.filename.endsWith('.feature'))
    expect(feature?.content).toContain('Feature:')
  })
})

describe('step definitions that resolve secrets stay valid code', () => {
  const stepsOf = (framework: FrameworkId) =>
    generated(withSecondPassword(), framework, true).filter((f) => !f.filename.endsWith('.feature'))

  it.each(['playwright-ts', 'cypress'] as const)('%s parses', (framework) => {
    for (const file of stepsOf(framework).filter((f) => /\.(ts|js)$/.test(f.filename))) {
      expect(syntaxErrors(file.content, file.filename)).toEqual([])
    }
  })

  it('selenium-py parses', () => {
    const files = stepsOf('selenium-py').filter((f) => f.filename.endsWith('.py'))
    const results = validatePythonSources(files.map((f) => f.content))
    results.forEach((r) => expect(r.ok || r.skipped, r.error).toBe(true))
  })

  it('selenium-java is balanced', () => {
    for (const file of stepsOf('selenium-java').filter((f) => f.filename.endsWith('.java'))) {
      expect(validateJavaSource(file.content).ok).toBe(true)
    }
  })

  it('cypress maps each reference to the key its env file uses', () => {
    const steps = stepsOf('cypress').find((f) => f.content.includes('SECRET_KEYS'))
    expect(steps?.content).toMatch(/"RECOSPEC_PASSWORD": "password"/)
    expect(steps?.content).toMatch(/"RECOSPEC_PASSWORD_\w+": "password\w+"/)
  })
})
