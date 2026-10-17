import { describe, it, expect } from 'vitest'
import { normalizeActions } from './normalizer/action-normalizer'
import { groupIntoPages } from './planner/page-grouper'
import { buildPromptDocument, renderPromptMarkdown } from './export/prompt-export'
import type { JsonExportPayload } from './export/json-export'
import recording from './__fixtures__/real-login-recording.json'

/**
 * A login flow captured by the real extension (content script + locator engine + background),
 * with credentials replaced. Unlike hand-written fixtures it contains what users really produce:
 * a focus click before every fill, an automatic network step and a networkidle wait.
 */
function loadRecording(): JsonExportPayload {
  return JSON.parse(JSON.stringify(recording)) as JsonExportPayload
}

describe('real recording — login flow', () => {
  it('has the shape of a genuine capture (focus clicks, network and wait steps)', () => {
    const types = loadRecording().actions.map((a) => a.type)
    expect(types).toEqual(['click', 'fill', 'click', 'fill', 'click', 'network', 'wait'])
  })

  it('infers login(email, password) despite the focus clicks', () => {
    const payload = loadRecording()
    const { flatSteps } = normalizeActions(payload.actions)
    const [page] = groupIntoPages(flatSteps, payload.session.startUrl)
    const names = (page?.inferredMethods ?? []).map((m) => m.name)

    expect(names).toContain('login')
    expect(names).not.toContain('clickEmail')
    const login = page?.inferredMethods?.find((m) => m.name === 'login')
    expect(login?.params).toEqual(['email', 'password'])
    expect(login?.paramSecret).toEqual([true, true])
  })

  it('renders a prompt whose flow has no redundant focus clicks', () => {
    const md = renderPromptMarkdown(
      buildPromptDocument(loadRecording(), { mode: 'prompt', framework: 'playwright-ts' }),
    )
    expect(md).toContain('<method name="login"')
    expect(md).not.toContain('action="click" element="emailInput"')
    expect(md).not.toContain('fixture-pass-1')
    expect(md).toContain('[REDACTED:RECOSPEC_PASSWORD]')
  })
})
