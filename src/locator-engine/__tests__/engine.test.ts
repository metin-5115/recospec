import { describe, it, expect } from 'vitest'
import { LocatorEngine } from '../index'

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('LocatorEngine', () => {
  const engine = new LocatorEngine()

  it('always falls back to css/xpath for nondescript elements', () => {
    const doc = parse(`<div><i></i></div>`)
    const i = doc.querySelector('i') as Element
    const bundle = engine.evaluate(i, doc)
    expect(bundle).not.toBeNull()
    expect(['css', 'xpath']).toContain(bundle!.primary.strategy)
  })

  it('forwards shadow context options into the bundle', () => {
    const doc = parse(`<button data-testid="confirm">OK</button>`)
    const btn = doc.querySelector('button') as Element
    const bundle = engine.evaluate(btn, doc, {
      shadowContext: { hostChain: ['my-app', 'confirm-dialog'] },
      shadowClosed: false,
    })
    expect(bundle?.shadowContext?.hostChain).toEqual(['my-app', 'confirm-dialog'])
    expect(bundle?.shadowClosed).toBe(false)
  })

  it('forwards frame context options into the bundle', () => {
    const doc = parse(`<input data-testid="card" />`)
    const input = doc.querySelector('input') as Element
    const bundle = engine.evaluate(input, doc, {
      frameContext: {
        frameUrl: 'https://stripe.example/checkout',
        frameName: 'card-frame',
        frameChain: ['iframe[name="card-frame"]'],
      },
    })
    expect(bundle?.frameContext?.frameName).toBe('card-frame')
  })

  it('builds canvas locator with id when present', () => {
    const doc = parse(`<canvas id="game-stage"></canvas>`)
    const canvas = doc.querySelector('canvas') as Element
    const bundle = engine.evaluate(canvas, doc)
    expect(bundle?.primary.selector).toBe('canvas#game-stage')
  })

  it('builds canvas locator with bare tag when id is missing', () => {
    const doc = parse(`<canvas></canvas>`)
    const canvas = doc.querySelector('canvas') as Element
    const bundle = engine.evaluate(canvas, doc)
    expect(bundle?.primary.selector).toBe('canvas')
  })

  it('does not attach edgeCases array on plain elements', () => {
    const doc = parse(`<form><input data-testid="a" /></form>`)
    const input = doc.querySelector('input') as Element
    const bundle = engine.evaluate(input, doc)
    expect(bundle?.edgeCases).toBeUndefined()
  })

  it('populates matchCount = 1 for a unique testid', () => {
    const doc = parse(`<button data-testid="confirm">OK</button>`)
    const btn = doc.querySelector('button') as Element
    const bundle = engine.evaluate(btn, doc)
    expect(bundle?.primary.matchCount).toBe(1)
  })

  it('populates matchCount > 1 for a non-unique class selector', () => {
    const doc = parse(
      `<ul><li class="row"><button>A</button></li><li class="row"><button>B</button></li></ul>`,
    )
    const btn = doc.querySelectorAll('button')[0] as Element
    const bundle = engine.evaluate(btn, doc)
    const cssCandidate = bundle?.allCandidates.find((c) => c.strategy === 'css')
    expect(cssCandidate).toBeDefined()
    expect(cssCandidate!.matchCount).toBeGreaterThan(1)
  })

  it('exposes allCandidates sorted by score desc, including primary + fallbacks + rejected', () => {
    const doc = parse(
      `<form><label for="email">Email</label><input id="email" data-testid="email" aria-label="Email" /></form>`,
    )
    const input = doc.querySelector('input') as Element
    const bundle = engine.evaluate(input, doc)
    expect(bundle?.allCandidates.length).toBeGreaterThanOrEqual(3)
    const scores = bundle!.allCandidates.map((c) => c.score)
    const sorted = [...scores].sort((a, b) => b - a)
    expect(scores).toEqual(sorted)
    const strategies = bundle!.allCandidates.map((c) => c.strategy)
    expect(strategies).toContain(bundle!.primary.strategy)
  })

  it('canvas locator carries matchCount and allCandidates', () => {
    const doc = parse(`<canvas id="game"></canvas>`)
    const canvas = doc.querySelector('canvas') as Element
    const bundle = engine.evaluate(canvas, doc)
    expect(bundle?.primary.matchCount).toBe(1)
    expect(bundle?.allCandidates).toEqual([bundle!.primary])
  })
})
