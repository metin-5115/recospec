import { describe, it, expect } from 'vitest'
import { buildLlmContext } from './llm-context'
import { renderLlmContextCompact, renderLlmContextJson, estimateTokens } from './llm-context-render'
import { buildPromptDocument, renderPromptMarkdown } from './prompt-export'
import type { JsonExportPayload } from './json-export'
import type { LlmContextTask } from '@shared/types/generated'
import login from '../__fixtures__/real-login-recording.json'
import checkout from '../__fixtures__/real-checkout-recording.json'

const load = (fixture: unknown): JsonExportPayload =>
  JSON.parse(JSON.stringify(fixture)) as JsonExportPayload

const LOGIN = () => load(login)
const CHECKOUT = () => load(checkout)

function compact(payload: JsonExportPayload, task: LlmContextTask = 'both', extra = {}): string {
  return renderLlmContextCompact(
    buildLlmContext(payload, { task, framework: 'playwright-ts', ...extra }),
  )
}

function xmlPrompt(payload: JsonExportPayload): string {
  return renderPromptMarkdown(
    buildPromptDocument(payload, { mode: 'prompt', framework: 'playwright-ts' }),
  )
}

describe('buildLlmContext', () => {
  it('lists every element once and refers to it by id from the steps', () => {
    const ctx = buildLlmContext(LOGIN(), { task: 'codegen', framework: 'playwright-ts' })
    const ids = ctx.elements.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const step of ctx.steps) {
      if (step.el) expect(ids).toContain(step.el)
    }
  })

  it('marks credential fields as secret and swaps their values for env references', () => {
    const ctx = buildLlmContext(LOGIN(), { task: 'codegen', framework: 'playwright-ts' })
    const fills = ctx.steps.filter((s) => s.action === 'fill')
    expect(fills.length).toBeGreaterThan(0)
    expect(fills.some((s) => s.value?.startsWith('$RECOSPEC_'))).toBe(true)
    expect(ctx.elements.some((e) => e.isSecret)).toBe(true)
  })

  it('keeps fallbacks and fingerprints only for the heal and both tasks', () => {
    const code = buildLlmContext(LOGIN(), { task: 'codegen' })
    const heal = buildLlmContext(LOGIN(), { task: 'heal' })
    expect(
      code.elements.every((e) => e.fallbacks.length === 0 && e.fingerprint === undefined),
    ).toBe(true)
    expect(heal.elements.some((e) => e.fallbacks.length > 0)).toBe(true)
    expect(heal.elements.some((e) => e.fingerprint !== undefined)).toBe(true)
  })

  it('caps fallbacks per element', () => {
    const ctx = buildLlmContext(CHECKOUT(), { task: 'heal' })
    expect(Math.max(...ctx.elements.map((e) => e.fallbacks.length))).toBeLessThanOrEqual(2)
  })

  it('reports page paths relative to a single base origin', () => {
    const ctx = buildLlmContext(CHECKOUT(), { task: 'codegen' })
    expect(ctx.base).toBe('http://localhost:4500')
    expect(ctx.pages.every((p) => p.path.startsWith('/'))).toBe(true)
  })
})

describe('renderLlmContextCompact', () => {
  it('matches the snapshot for each task', () => {
    for (const task of ['codegen', 'heal', 'both'] as const) {
      expect(compact(LOGIN(), task)).toMatchSnapshot(`login ${task}`)
    }
    expect(compact(CHECKOUT(), 'both')).toMatchSnapshot('checkout both')
  })

  it('has no fallback or fingerprint lines for codegen', () => {
    const text = compact(LOGIN(), 'codegen')
    expect(text).not.toContain('\n@fp')
    expect(text).not.toContain(' ~ ')
  })

  it('has fallback and fingerprint lines for heal', () => {
    const text = compact(LOGIN(), 'heal')
    expect(text).toContain('\n@fp')
    expect(text).toContain(' ~ ')
  })

  it('never leaks the recorded secret values', () => {
    const payload = LOGIN()
    const secrets = payload.actions
      .filter((a) => a.type === 'fill' && /pass/i.test(JSON.stringify(a.target?.elementSnapshot)))
      .map((a) => String(a.payload?.value))
    expect(secrets.length).toBeGreaterThan(0)
    const text = compact(payload, 'both')
    for (const secret of secrets) expect(text).not.toContain(secret)
  })

  it('omits the legend, rules and task when instructions are disabled', () => {
    const text = compact(LOGIN(), 'both', { includeInstructions: false })
    expect(text).not.toContain('@rules')
    expect(text).not.toContain('@task')
  })

  it('is at most half of the XML prompt size', () => {
    for (const payload of [LOGIN(), CHECKOUT()]) {
      const ratio = compact(payload, 'both').length / xmlPrompt(payload).length
      expect(ratio).toBeLessThanOrEqual(0.5)
    }
  })
})

describe('renderLlmContextJson', () => {
  it('is single-line JSON that round-trips', () => {
    const text = renderLlmContextJson(
      buildLlmContext(CHECKOUT(), { task: 'both', framework: 'playwright-ts' }),
    )
    expect(text).not.toContain('\n')
    const parsed = JSON.parse(text) as { v: number; el: unknown[]; steps: unknown[][] }
    expect(parsed.v).toBe(1)
    expect(parsed.el.length).toBeGreaterThan(0)
    expect(Array.isArray(parsed.steps[0])).toBe(true)
  })

  it('is at most 60% of the XML prompt size', () => {
    for (const payload of [LOGIN(), CHECKOUT()]) {
      const json = renderLlmContextJson(buildLlmContext(payload, { task: 'both' }))
      expect(json.length / xmlPrompt(payload).length).toBeLessThanOrEqual(0.6)
    }
  })
})

describe('estimateTokens', () => {
  it('uses a characters-per-token heuristic, rounded up', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
  })
})

describe('buildLlmContext — file upload', () => {
  it('describes an upload step by its file names, never a local path', () => {
    const payload = LOGIN()
    const fill = payload.actions.find((a) => a.type === 'fill')!
    payload.actions.push({
      ...fill,
      actionId: 'upload-1',
      sequenceNumber: payload.actions.length,
      type: 'upload',
      payload: { fileNames: ['me.png'], multiple: false },
    })
    const ctx = buildLlmContext(payload, { task: 'codegen', framework: 'playwright-ts' })
    const upload = ctx.steps.find((s) => s.action === 'upload')
    expect(upload?.value).toBe('"me.png"')
  })
})
