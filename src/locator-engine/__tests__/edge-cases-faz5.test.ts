import { describe, it, expect, beforeEach } from 'vitest'
import { LocatorEngine } from '../index'
import { buildFingerprint } from '../pipeline/fingerprint'
import { isDynamicId } from '../scoring/dynamic-detector'

/**
 * Faz 5 edge-case coverage (spec §7): sequential-counter ids, virtualized
 * re-render identity drift, contenteditable, and locale-dependent labels.
 */

const engine = new LocatorEngine()

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('sequential-counter ids never win over a semantic strategy', () => {
  // ASSUMPTION: the dynamic-id detector deliberately ACCEPTS short numeric
  // suffixes (input-7, BVD-135) to avoid false positives on ticket / version
  // ids — see dynamic-detector.test.ts. So the spec's "reject input-7" intent
  // is satisfied at the SCORING level instead: `id` is tier-1, below every
  // semantic strategy, so a counter id is only ever the primary when nothing
  // better exists.
  it('a high-entropy / framework id is still rejected outright', () => {
    expect(isDynamicId('ember1234')).toBe(true)
    expect(isDynamicId('react-aria-12345')).toBe(true)
  })

  it('the engine prefers a semantic strategy over a counter id', () => {
    document.body.innerHTML = `<input id="input-7" placeholder="Email address" />`
    const el = document.querySelector('input')!
    const bundle = engine.evaluate(el, document)
    expect(bundle).not.toBeNull()
    expect(bundle!.primary.strategy).not.toBe('id')
    expect(['role-name', 'placeholder']).toContain(bundle!.primary.strategy)
  })

  it('falls back to the counter id only when nothing semantic is available', () => {
    document.body.innerHTML = `<div id="widget-3"><span>x</span></div>`
    const el = document.querySelector('#widget-3')!
    const bundle = engine.evaluate(el, document)
    expect(bundle).not.toBeNull()
    // id is allowed here (no better candidate) — it is a valid, if plain, locator.
    expect(bundle!.primary.strategy).toBe('id')
  })
})

describe('contenteditable elements', () => {
  it('produces a usable (non-null) locator', () => {
    document.body.innerHTML = `<div contenteditable="true" aria-label="Message body">Hello</div>`
    const el = document.querySelector('[contenteditable]')!
    const bundle = engine.evaluate(el, document)
    expect(bundle).not.toBeNull()
    expect(bundle!.primary.strategy).toBe('aria-label')
  })
})

describe('locale-dependent labels are flagged on the scored locator', () => {
  it('marks a text-keyed primary localeDependent', () => {
    document.body.innerHTML = `<input placeholder="Ara…" />`
    const el = document.querySelector('input')!
    const bundle = engine.evaluate(el, document)
    // role-name or placeholder — either keys on the localized placeholder copy.
    expect(['role-name', 'placeholder']).toContain(bundle!.primary.strategy)
    expect(bundle!.primary.features?.localeDependent).toBe(true)
  })

  it('does NOT flag a testid primary localeDependent', () => {
    document.body.innerHTML = `<button data-testid="submit">Gönder</button>`
    const el = document.querySelector('button')!
    const bundle = engine.evaluate(el, document)
    expect(bundle!.primary.strategy).toBe('testid')
    expect(bundle!.primary.features?.localeDependent).toBe(false)
  })
})

describe('virtualized re-render — fingerprint stays stable', () => {
  it('matches an element across an id + class churn when name/neighbors hold', () => {
    document.body.innerHTML = `
      <ul><li><span>Row above</span></li>
      <li id="row-100" class="css-abc"><button aria-label="Open ticket 42">Open</button></li>
      <li><span>Row below</span></li></ul>`
    const before = buildFingerprint(document.querySelector('button')!, document)

    // Virtualized list re-renders: id counter shifts, hashed class regenerates,
    // but the accessible name and neighbouring rows are unchanged.
    document.body.innerHTML = `
      <ul><li><span>Row above</span></li>
      <li id="row-258" class="css-zzz"><button aria-label="Open ticket 42">Open</button></li>
      <li><span>Row below</span></li></ul>`
    const after = buildFingerprint(document.querySelector('button')!, document)

    expect(after.accessibleName).toBe(before.accessibleName)
    expect(after.neighborTexts).toEqual(before.neighborTexts)
    expect(after.domPath).toBe(before.domPath)
  })
})
