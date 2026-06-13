import { describe, it, expect, beforeEach } from 'vitest'
import type { Locator, ScoredLocator } from '@shared/types/locator'
import { scoreFeatures, WEIGHTS } from '../weights'
import { extractFeatures } from '../features'
import { resolveLocator, isA11yVisible } from '../resolve'
import { applyConstraints } from '../constraints'
import { isRenderable, supportsFramework } from '../renderability'
import { buildFingerprint } from '../fingerprint'
import { buildComposedCandidate } from '../../strategies/composed'
import { LocatorEngine } from '../../index'

function loc(partial: Partial<Locator> & Pick<Locator, 'strategy' | 'selector'>): Locator {
  return { framework: {}, ...partial }
}

function scored(
  partial: Partial<ScoredLocator> & Pick<Locator, 'strategy' | 'selector'>,
): ScoredLocator {
  return { framework: {}, score: 0, matchCount: 1, ...partial }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

// ---------------------------------------------------------------------------
// Stage B — feature extraction + weights
// ---------------------------------------------------------------------------

describe('extractFeatures + scoreFeatures', () => {
  it('ranks testid at the top of the scale', () => {
    const f = extractFeatures(loc({ strategy: 'testid', selector: 'submit-btn' }))
    expect(f.attrTier).toBe(3)
    expect(scoreFeatures(f)).toBe(90)
  })

  it('scores aria/role above id, id above class-css, class-css above stable text', () => {
    const aria = scoreFeatures(
      extractFeatures(loc({ strategy: 'aria-label', selector: '[aria-label="Sign In"]' })),
    )
    const id = scoreFeatures(extractFeatures(loc({ strategy: 'id', selector: '#email' })))
    const cssClass = scoreFeatures(
      extractFeatures(loc({ strategy: 'css', selector: 'button.primary' })),
    )
    const text = scoreFeatures(extractFeatures(loc({ strategy: 'text', selector: 'Sign In' })))
    expect(aria).toBeGreaterThan(id)
    expect(id).toBeGreaterThan(cssClass)
    expect(cssClass).toBeGreaterThan(text)
  })

  it('attribute-anchored css outranks class-only css', () => {
    const attr = scoreFeatures(
      extractFeatures(loc({ strategy: 'css', selector: 'input[name="email"]' })),
    )
    const cls = scoreFeatures(
      extractFeatures(loc({ strategy: 'css', selector: 'input.form-field' })),
    )
    expect(attr).toBeGreaterThan(cls)
  })

  it('does NOT count spaces inside quoted attribute values as depth', () => {
    const f = extractFeatures(
      loc({ strategy: 'css', selector: 'input[placeholder="What needs to be done?"]' }),
    )
    expect(f.depth).toBe(1)
  })

  it('penalises positional indices below everything non-positional', () => {
    const positional = scoreFeatures(
      extractFeatures(loc({ strategy: 'css', selector: 'div > span:nth-of-type(3)' })),
    )
    const text = scoreFeatures(extractFeatures(loc({ strategy: 'text', selector: 'Sign In' })))
    expect(positional).toBeLessThan(text)
  })

  it('flags deep positional xpath via [N] and step depth', () => {
    const f = extractFeatures(
      loc({ strategy: 'xpath', selector: '//*[@id="root"]/div/div[2]/form/div[3]/span' }),
    )
    expect(f.hasPositionalIndex).toBe(true)
    expect(f.depth).toBeGreaterThan(3)
    expect(scoreFeatures(f)).toBeLessThan(20)
  })

  it('marks volatile text as data and tanks the score', () => {
    const f = extractFeatures(loc({ strategy: 'text', selector: '294.840', volatile: true }))
    expect(f.textIsData).toBe(true)
    expect(scoreFeatures(f)).toBeLessThan(10)
  })

  it('rewards a composed candidate with a testid anchor over a role anchor', () => {
    const base = {
      target: { tag: 'span', role: 'gridcell', name: 'Day' },
      xpath: '//x',
    }
    const testidAnchor = loc({
      strategy: 'composed',
      selector: 'a',
      composed: { anchor: { kind: 'testid', value: 'cal', css: '[data-testid="cal"]' }, ...base },
    })
    const roleAnchor = loc({
      strategy: 'composed',
      selector: 'b',
      composed: { anchor: { kind: 'role', value: 'grid', css: '[role="grid"]' }, ...base },
    })
    expect(scoreFeatures(extractFeatures(testidAnchor))).toBeGreaterThan(
      scoreFeatures(extractFeatures(roleAnchor)),
    )
  })

  it('keeps every score inside 0..100', () => {
    const worst = scoreFeatures({
      attrTier: 0,
      textIsData: true,
      classEntropy: 5,
      depth: 12,
      hasPositionalIndex: true,
      isComposed: false,
      anchorTier: 0,
      localeDependent: true,
    })
    expect(worst).toBeGreaterThanOrEqual(0)
    const best = scoreFeatures({
      attrTier: 3,
      textIsData: false,
      classEntropy: 0,
      depth: 1,
      hasPositionalIndex: false,
      isComposed: true,
      anchorTier: 3,
      localeDependent: false,
    })
    expect(best).toBeLessThanOrEqual(100)
  })

  it('exposes a single weights table for calibration', () => {
    expect(WEIGHTS.positionalIndex).toBeLessThan(0)
    expect(WEIGHTS.textIsData).toBeLessThan(0)
  })
})

// ---------------------------------------------------------------------------
// resolve — strategy-aware counting
// ---------------------------------------------------------------------------

describe('resolveLocator', () => {
  it('counts a11y-visible elements only for role-name (hidden dup nav trap)', () => {
    document.body.innerHTML = `
      <nav style="display:none"><button>Menu</button></nav>
      <nav><button>Menu</button></nav>`
    const matches = resolveLocator(
      loc({ strategy: 'role-name', selector: 'button[name="Menu"]' }),
      document,
    )
    expect(matches).toHaveLength(1)
    expect(isA11yVisible(matches[0])).toBe(true)
  })

  it('counts the whole DOM for css (querySelector semantics)', () => {
    document.body.innerHTML = `
      <div style="display:none"><button class="cta">A</button></div>
      <button class="cta">B</button>`
    expect(resolveLocator(loc({ strategy: 'css', selector: 'button.cta' }), document)).toHaveLength(
      2,
    )
  })

  it('matches the deepest element only for text (no ancestor double-count)', () => {
    document.body.innerHTML = `<button><span>Unique Caption</span></button>`
    const matches = resolveLocator(loc({ strategy: 'text', selector: 'Unique Caption' }), document)
    expect(matches).toHaveLength(1)
    expect(matches[0].tagName).toBe('SPAN')
  })

  it('resolves the testid attribute family including data-cy', () => {
    document.body.innerHTML = `<button data-cy="go">Go</button>`
    expect(resolveLocator(loc({ strategy: 'testid', selector: 'go' }), document)).toHaveLength(1)
  })

  it('resolves label → associated control', () => {
    document.body.innerHTML = `<label for="em">Email</label><input id="em" />`
    const matches = resolveLocator(loc({ strategy: 'label', selector: 'Email' }), document)
    expect(matches).toHaveLength(1)
    expect(matches[0].id).toBe('em')
  })

  it('resolves xpath via document.evaluate', () => {
    document.body.innerHTML = `<form><input name="q" /></form>`
    expect(
      resolveLocator(loc({ strategy: 'xpath', selector: '//input[@name="q"]' }), document),
    ).toHaveLength(1)
  })

  it('returns [] for malformed selectors instead of throwing', () => {
    expect(resolveLocator(loc({ strategy: 'css', selector: ':::garbage' }), document)).toEqual([])
    expect(resolveLocator(loc({ strategy: 'xpath', selector: '\\bad(' }), document)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Stage A — constraints
// ---------------------------------------------------------------------------

describe('applyConstraints', () => {
  it('rejects non-unique candidates with a match-count detail', () => {
    document.body.innerHTML = `<button class="x">A</button><button class="x">B</button>`
    const el = document.querySelector('button')!
    const candidate = scored({ strategy: 'css', selector: 'button.x' })
    const { passed, diagnostics } = applyConstraints(
      [{ candidate, matches: resolveLocator(candidate, document) }],
      el,
    )
    expect(passed).toHaveLength(0)
    expect(diagnostics[0].reason).toBe('not-unique')
    expect(diagnostics[0].detail).toContain('2')
  })

  it('rejects volatile raw values regardless of uniqueness', () => {
    document.body.innerHTML = `<span>294.840</span>`
    const el = document.querySelector('span')!
    const candidate = scored({ strategy: 'text', selector: '294.840', volatile: true })
    const { passed, diagnostics } = applyConstraints([{ candidate, matches: [el] }], el)
    expect(passed).toHaveLength(0)
    expect(diagnostics[0].reason).toBe('volatile-raw-value')
  })

  it('rejects a unique match that is a DIFFERENT element', () => {
    document.body.innerHTML = `<button id="a">A</button><button id="b">B</button>`
    const a = document.getElementById('a')!
    const candidate = scored({ strategy: 'id', selector: '#b' })
    const { passed, diagnostics } = applyConstraints(
      [{ candidate, matches: resolveLocator(candidate, document) }],
      a,
    )
    expect(passed).toHaveLength(0)
    expect(diagnostics[0].reason).toBe('validation-failed')
  })

  it('passes a unique candidate that resolves to the element', () => {
    document.body.innerHTML = `<button id="a">A</button>`
    const a = document.getElementById('a')!
    const candidate = scored({ strategy: 'id', selector: '#a' })
    const { passed, diagnostics } = applyConstraints(
      [{ candidate, matches: resolveLocator(candidate, document) }],
      a,
    )
    expect(passed).toHaveLength(1)
    expect(diagnostics).toHaveLength(0)
  })
})

describe('renderability matrix', () => {
  it('requires playwright + at least one other framework', () => {
    expect(isRenderable('testid')).toBe(true)
    expect(isRenderable('composed')).toBe(true)
  })
  it('answers per-framework support queries', () => {
    expect(supportsFramework('composed', 'selenium-java')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// composed strategy
// ---------------------------------------------------------------------------

describe('buildComposedCandidate', () => {
  it('scopes under a testid anchor and resolves uniquely by role+name', () => {
    document.body.innerHTML = `
      <div data-testid="calendar">
        <span role="button" aria-label="Pick A">A</span>
        <span role="button" aria-label="Pick B">B</span>
      </div>`
    const el = document.querySelector('[aria-label="Pick B"]')!
    const composed = buildComposedCandidate(el, document)
    expect(composed).not.toBeNull()
    expect(composed!.composed!.anchor).toMatchObject({ kind: 'testid', value: 'calendar' })
    expect(composed!.composed!.target.name).toBe('Pick B')
    expect(resolveLocator(composed!, document)).toEqual([el])
  })

  it('never embeds a volatile accessible name — degrades to filter/nth', () => {
    document.body.innerHTML = `
      <div role="grid">
        <span role="button" aria-label="12 Ağustos 2026 Çarşamba" class="day">12</span>
        <span role="button" aria-label="13 Ağustos 2026 Perşembe" class="day">13</span>
      </div>`
    const el = document.querySelectorAll('span')[1]
    const composed = buildComposedCandidate(el, document)
    expect(composed).not.toBeNull()
    expect(composed!.composed!.target.name).toBeUndefined()
    expect(JSON.stringify(composed!.composed)).not.toContain('Ağustos')
    expect(resolveLocator(composed!, document)).toEqual([el])
  })

  it('marks the nth ladder step as a positional-index warning', () => {
    document.body.innerHTML = `
      <div role="grid">
        <span class="cell">1</span><span class="cell">2</span><span class="cell">3</span>
      </div>`
    const el = document.querySelectorAll('span')[2]
    const composed = buildComposedCandidate(el, document)
    expect(composed).not.toBeNull()
    // own text "3" is a data value → filter skipped → nth fallback
    expect(composed!.composed!.nthIndex).toBe(2)
    expect(composed!.warning).toBe('positional-index')
    expect(resolveLocator(composed!, document)).toEqual([el])
  })

  it('returns null when no stable unique anchor exists', () => {
    document.body.innerHTML = `<div><span>x</span></div>`
    const el = document.querySelector('span')!
    expect(buildComposedCandidate(el, document)).toBeNull()
  })

  it('precomputes a selenium-ready xpath that hits the same element', () => {
    document.body.innerHTML = `
      <form>
        <span class="hint">First</span>
        <span class="hint">Second</span>
      </form>`
    const el = document.querySelectorAll('span')[1]
    const composed = buildComposedCandidate(el, document)
    expect(composed).not.toBeNull()
    const xpath = composed!.composed!.xpath
    const result = document.evaluate(xpath, document, null, 9, null)
    expect(result.singleNodeValue).toBe(el)
  })
})

// ---------------------------------------------------------------------------
// fingerprint
// ---------------------------------------------------------------------------

describe('buildFingerprint', () => {
  it('captures identity with dynamic attribute values masked', () => {
    document.body.innerHTML = `
      <section><h2>Pricing</h2>
        <div><span>Prev</span><button data-price="294.840" role="button" aria-label="Buy now">Buy</button><span>Next</span></div>
      </section>`
    const el = document.querySelector('button')!
    const fp = buildFingerprint(el, document)
    expect(fp.tag).toBe('button')
    expect(fp.attributes['data-price']).toBe('«dynamic»')
    expect(fp.accessibleName).toBe('Buy now')
    expect(fp.neighborTexts).toContain('Prev')
    expect(fp.neighborTexts).toContain('Pricing')
    expect(fp.domPath).toBe('body>section>div>button')
    expect(fp.boundingBoxRatio).toEqual({ x: 0, y: 0 })
  })
})

// ---------------------------------------------------------------------------
// engine end-to-end pipeline behaviour
// ---------------------------------------------------------------------------

describe('LocatorEngine pipeline', () => {
  const engine = new LocatorEngine()

  it('produces a strict-unique primary with reasoned diagnostics for the calendar case', () => {
    document.body.innerHTML = `
      <div role="grid">
        ${Array.from({ length: 30 }, (_, i) => `<span role="button" aria-label="${i + 1} Ağustos 2026" class="vc-day-content">${i + 1}</span>`).join('')}
      </div>`
    const el = document.querySelectorAll('span')[11]
    const bundle = engine.evaluate(el, document)!
    expect(bundle).not.toBeNull()
    // Primary must be unique to exactly this element…
    expect(resolveLocator(bundle.primary, document)).toEqual([el])
    // …and the date identity becomes a parameterized TEMPLATE — the raw date
    // never appears in the locator string (capturedValue metadata records it
    // by design; codegen parameterizes).
    expect(bundle.primary.strategy).toBe('template')
    expect(String(bundle.primary.selector)).not.toContain('Ağustos')
    expect(bundle.primary.template!.nameTemplate).toMatch(/^\{date:/)
    expect(bundle.primary.template!.localeId).toBe('tr')
    // …and the volatile rejections are explained.
    expect(bundle.diagnostics!.some((d) => d.reason === 'volatile-raw-value')).toBe(true)
  })

  it('keeps testid as primary when present and fills diverse fallbacks', () => {
    document.body.innerHTML = `
      <form>
        <button data-testid="submit" type="submit" aria-label="Submit form">Submit</button>
      </form>`
    const el = document.querySelector('button')!
    const bundle = engine.evaluate(el, document)!
    expect(bundle.primary.strategy).toBe('testid')
    const strategies = bundle.fallbacks.map((f) => f.strategy)
    expect(new Set(strategies).size).toBe(strategies.length)
  })

  it('always ships a fingerprint on the bundle', () => {
    document.body.innerHTML = `<button data-testid="x">X</button>`
    const bundle = engine.evaluate(document.querySelector('button')!, document)!
    expect(bundle.fingerprint?.tag).toBe('button')
  })

  it('validates every bundle member against the snapshot (exactly-1 contract)', () => {
    document.body.innerHTML = `
      <div data-testid="wrap"><a href="/about" class="nav-link">About</a></div>`
    const el = document.querySelector('a')!
    const bundle = engine.evaluate(el, document)!
    for (const member of [bundle.primary, ...bundle.fallbacks]) {
      expect(resolveLocator(member, document)).toEqual([el])
    }
  })
})
