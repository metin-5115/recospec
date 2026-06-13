import { describe, it, expect } from 'vitest'
import { buildCorrectionRecord, serializeCorrection, parseCorrections } from './corrections'
import type { ScoredLocator, ElementFingerprint } from './types/locator'

const fingerprint: ElementFingerprint = {
  tag: 'a',
  attributes: { class: 'nav-link', href: 'https://x.test/profile?id=9' },
  role: null,
  accessibleName: 'Profile',
  neighborTexts: ['Home', 'Settings'],
  domPath: 'body>nav>a',
  boundingBoxRatio: { x: 0.1, y: 0.2 },
}

const rejected: ScoredLocator = {
  strategy: 'css',
  selector: 'nav > a:nth-child(2)',
  score: 22,
  matchCount: 1,
  framework: {},
}

describe('buildCorrectionRecord', () => {
  it('captures the rejected/chosen/fingerprint triple', () => {
    const rec = buildCorrectionRecord({
      rejected,
      chosen: 'getByRole("link", { name: "Profile" })',
      fingerprint,
      at: '2026-06-13T00:00:00.000Z',
    })
    expect(rec.v).toBe(1)
    expect(rec.rejected.strategy).toBe('css')
    expect(rec.rejected.selector).toBe('nav > a:nth-child(2)')
    expect(rec.chosen).toContain('getByRole')
    expect(rec.at).toBe('2026-06-13T00:00:00.000Z')
  })

  it('redacts URL-like attribute values (no PII leaks)', () => {
    const rec = buildCorrectionRecord({
      rejected,
      chosen: 'x',
      fingerprint,
      at: '2026-06-13T00:00:00.000Z',
    })
    expect(rec.fingerprint.attributes.href).toBe('«redacted»')
    expect(rec.fingerprint.attributes.class).toBe('nav-link') // kept
  })
})

describe('serialize + parse round-trip', () => {
  it('round-trips a record through JSONL', () => {
    const rec = buildCorrectionRecord({
      rejected,
      chosen: 'x',
      fingerprint,
      at: '2026-06-13T00:00:00.000Z',
    })
    const line = serializeCorrection(rec)
    expect(line.endsWith('\n')).toBe(true)
    const parsed = parseCorrections(line)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.chosen).toBe('x')
  })

  it('skips malformed and blank lines', () => {
    const body = `${serializeCorrection(buildCorrectionRecord({ rejected, chosen: 'a', fingerprint, at: 't' }))}\nnot-json\n{"v":2}\n`
    const parsed = parseCorrections(body)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.chosen).toBe('a')
  })
})
