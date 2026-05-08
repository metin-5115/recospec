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
})
