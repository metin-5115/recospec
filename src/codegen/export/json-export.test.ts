import { describe, it, expect } from 'vitest'
import type { RecordedAction } from '@shared/types/action'
import { buildJsonExport, type JsonExportPayload } from './json-export'
import { buildPromptDocument, renderPromptMarkdown } from './prompt-export'
import loginRecording from '../__fixtures__/real-login-recording.json'

const EMAIL = 'user@example.com'
const PASSWORD = 'fixture-pass-1'
const WRONG_PASSWORD = 'wrong-pass-9'

function load(): JsonExportPayload {
  return JSON.parse(JSON.stringify(loginRecording)) as JsonExportPayload
}

/** The recording with a wrong password submitted first, then the valid one typed into the same field. */
function withSecondPassword(): JsonExportPayload {
  const payload = load()
  const index = payload.actions.findIndex((a) => a.payload?.value === PASSWORD)
  const typedFirst: RecordedAction = {
    ...payload.actions[index]!,
    actionId: 'wrong-password-fill',
    payload: { value: WRONG_PASSWORD },
  }
  const submit = payload.actions.slice(index).find((a) => a.type === 'click')!
  payload.actions.splice(index, 0, typedFirst, { ...submit, actionId: 'first-submit' })
  payload.actions.forEach((a, i) => (a.sequenceNumber = i))
  return payload
}

describe('buildJsonExport', () => {
  it('masks sensitive fill values by default', () => {
    const payload = load()
    const text = JSON.stringify(buildJsonExport(payload.session, payload.actions))
    for (const secret of [EMAIL, PASSWORD]) expect(text).not.toContain(secret)
    expect(text).toContain('[REDACTED:RECOSPEC_PASSWORD]')
  })

  it('keeps different values of one field distinguishable and equal values equal', () => {
    const payload = withSecondPassword()
    const exported = buildJsonExport(payload.session, payload.actions)
    const values = exported.actions
      .filter((a) => a.type === 'fill' && a.target?.elementSnapshot.attributes?.type === 'password')
      .map((a) => String(a.payload?.value))
    expect(new Set(values).size).toBe(2)
    expect(values.every((v) => v.startsWith('[REDACTED:'))).toBe(true)
  })

  it('does not mutate the recorded actions', () => {
    const payload = load()
    buildJsonExport(payload.session, payload.actions)
    expect(JSON.stringify(payload.actions)).toContain(PASSWORD)
  })

  it('can keep the raw values for in-memory consumers', () => {
    const payload = load()
    const exported = buildJsonExport(payload.session, payload.actions, { maskSecrets: false })
    expect(JSON.stringify(exported)).toContain(PASSWORD)
  })

  it('leaves non-sensitive actions untouched', () => {
    const payload = load()
    const exported = buildJsonExport(payload.session, payload.actions)
    const plain = (a: RecordedAction) => a.type !== 'fill'
    expect(exported.actions.filter(plain)).toEqual(payload.actions.filter(plain))
  })
})

describe('prompt export from a masked JSON export', () => {
  it('still builds, and names the same environment variables', () => {
    const recorded = load()
    const masked = buildJsonExport(recorded.session, recorded.actions)
    const prompt = (payload: JsonExportPayload) =>
      renderPromptMarkdown(buildPromptDocument(payload, { mode: 'prompt' }))
    const fromMasked = prompt(masked)
    expect(fromMasked).not.toContain(PASSWORD)
    expect(fromMasked).toContain('RECOSPEC_PASSWORD')
    expect(fromMasked).toBe(prompt({ ...recorded, exportedAt: masked.exportedAt }))
  })
})
