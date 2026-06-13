import { describe, it, expect, beforeEach } from 'vitest'
import { LocatorEngine } from '../index'
import { buildComposedCandidate } from '../strategies/composed'
import { resolveLocator } from '../pipeline/resolve'
import { XPathStrategy } from '../strategies/xpath'

/**
 * Stage 1+3 — the etstur regression. A leaf with dynamic text inside a repeated
 * card (no testid, non-unique class) must yield a scoped container locator
 * keyed by the row's STABLE label, never a score-0 absolute XPath.
 */

const engine = new LocatorEngine()

beforeEach(() => {
  document.body.innerHTML = ''
})

/** N hotel cards, each with a unique name <h3> and a dynamic price <p>. */
function mountCardList(): Element {
  document.body.innerHTML = `
    <div id="__next"><div class="results">
      ${[
        ['Acapulco Resort Convention Spa', '76.800 TL'],
        ['Nuhun Gemisi Deluxe Hotel', '54.200 TL'],
        ['Concorde Luxury Resort', '91.500 TL'],
      ]
        .map(
          ([name, price]) =>
            `<div class="card mui-x9f"><h3 class="title">${name}</h3><p class="price">${price}</p></div>`,
        )
        .join('')}
    </div></div>`
  // The dynamic price <p> of the first card.
  return document.querySelectorAll('.card .price')[0]!
}

describe('container anchor — scoped by stable label', () => {
  it('anchors a repeated card by its stable name, never the dynamic price', () => {
    const price = mountCardList()
    const loc = buildComposedCandidate(price, document)
    expect(loc).not.toBeNull()
    expect(loc!.composed!.anchor.kind).toBe('container')
    expect(loc!.composed!.anchor.filterText).toBe('Acapulco Resort Convention Spa')
    const selector = String(loc!.selector)
    expect(selector).not.toContain('76.800') // the dynamic value never leaks
    expect(resolveLocator(loc!, document)).toEqual([price])
  })

  it('engine picks the container-composed primary (not a score-0 xpath)', () => {
    const price = mountCardList()
    const bundle = engine.evaluate(price, document)
    expect(bundle).not.toBeNull()
    expect(bundle!.primary.strategy).toBe('composed')
    expect(bundle!.primary.composed!.anchor.kind).toBe('container')
    expect(bundle!.primary.score).toBeGreaterThan(0)
    expect(bundle!.primary.warning).not.toBe('absolute-xpath')
    expect(resolveLocator(bundle!.primary, document)).toEqual([price])
  })

  it('renders Playwright .filter({ hasText }) scope', () => {
    const price = mountCardList()
    const loc = buildComposedCandidate(price, document)
    expect(loc!.framework.playwright).toContain(
      '.filter({ hasText: "Acapulco Resort Convention Spa" })',
    )
  })

  it('climbs past an intermediate repeated wrapper to anchor the card by name', () => {
    // Real-world shape: the price sits in a `.price-row` wrapper that is ALSO
    // repeated. The nearest repeated container (the wrapper) has no stable label,
    // but the card one level up does — the anchor must key on the card's name,
    // not fall back to a positional index on the wrapper.
    document.body.innerHTML = `
      <div class="grid">
        ${[
          ['Liberty Hotels Lykia', '54.300'],
          ['Maxx Royal Belek', '92.150'],
          ['Rixos Premium', '63.900'],
        ]
          .map(
            ([name, price]) =>
              `<article class="hotel-card"><h3 class="hotel-name">${name}</h3>
                 <div class="price-row"><div class="price">₺${price} <small>/ 4 gece</small></div></div></article>`,
          )
          .join('')}
      </div>`
    const price = document.querySelectorAll('.hotel-card .price')[0]!
    const loc = buildComposedCandidate(price, document)
    expect(loc).not.toBeNull()
    expect(loc!.composed!.anchor.kind).toBe('container')
    expect(loc!.composed!.anchor.filterText).toBe('Liberty Hotels Lykia')
    expect(loc!.composed!.anchor.nthIndex).toBeUndefined() // NOT the positional wrapper
    expect(String(loc!.selector)).not.toContain('54.300')
    expect(loc!.framework.playwright).toContain('.filter({ hasText: "Liberty Hotels Lykia" })')
    expect(resolveLocator(loc!, document)).toEqual([price])
  })

  it('falls back to a positional anchor (FRAGILE) when cards share all stable text', () => {
    document.body.innerHTML = `
      <div class="list">
        <div class="row r"><span class="lbl">Item</span><p class="v">${'1'}</p></div>
        <div class="row r"><span class="lbl">Item</span><p class="v">${'2'}</p></div>
        <div class="row r"><span class="lbl">Item</span><p class="v">${'3'}</p></div>
      </div>`
    const v = document.querySelectorAll('.row .v')[1]!
    const loc = buildComposedCandidate(v, document)
    expect(loc).not.toBeNull()
    expect(loc!.composed!.anchor.kind).toBe('container')
    expect(loc!.composed!.anchor.nthIndex).toBe(1)
    expect(loc!.warning).toBe('positional-index')
    expect(resolveLocator(loc!, document)).toEqual([v])
  })

  it('returns null when there is no repeated container (singleton)', () => {
    document.body.innerHTML = `<div class="solo"><span id="s">x</span></div>`
    expect(buildComposedCandidate(document.querySelector('#s')!, document)).toBeNull()
  })
})

describe('interactive-ancestor anchor', () => {
  it('anchors a span inside a unique CTA button (class)', () => {
    document.body.innerHTML = `<button class="cta primary"><span id="s">Buy now</span></button>`
    const loc = buildComposedCandidate(document.querySelector('#s')!, document)
    expect(loc).not.toBeNull()
    expect(loc!.composed!.anchor.css).toBe('button.cta.primary')
    expect(loc!.framework.playwright).toContain('page.locator("button.cta.primary")')
    expect(resolveLocator(loc!, document)).toEqual([document.querySelector('#s')])
  })

  it('anchors inside a unique link by its href path', () => {
    document.body.innerHTML = `<a href="/profile?ref=x"><i id="ic" class="mui-z9"></i></a>`
    const loc = buildComposedCandidate(document.querySelector('#ic')!, document)
    expect(loc).not.toBeNull()
    expect(loc!.composed!.anchor.css).toBe('a[href^="/profile"]')
  })
})

describe('xpath strategy — relative fallback to nearest stable ancestor', () => {
  it('scopes to a stable-class ancestor instead of an absolute positional path', () => {
    document.body.innerHTML = `
      <section class="panel"><div><div><b id="leaf">x</b></div></div></section>`
    const loc = new XPathStrategy().evaluate(document.querySelector('#leaf')!, document)
    expect(loc).not.toBeNull()
    expect(loc!.warning).not.toBe('absolute-xpath')
    expect(String(loc!.selector)).toContain('panel')
    expect(resolveLocator(loc!, document)).toEqual([document.querySelector('#leaf')])
  })

  it('still emits an absolute path when no stable ancestor exists', () => {
    document.body.innerHTML = `<div><div><b id="leaf">x</b></div></div>`
    const loc = new XPathStrategy().evaluate(document.querySelector('#leaf')!, document)
    expect(loc!.warning).toBe('absolute-xpath')
  })
})
