import { describe, it, expect } from 'vitest'
import {
  detectEdgeCases,
  isCanvasLikeElement,
  isHoverOnlyContext,
  isPortalContext,
} from '../edge-cases'
import { LocatorEngine } from '../index'

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('isCanvasLikeElement', () => {
  it('detects canvas tag', () => {
    const el = document.createElement('canvas')
    expect(isCanvasLikeElement(el)).toBe(true)
  })

  it('detects video without controls', () => {
    const el = document.createElement('video')
    expect(isCanvasLikeElement(el)).toBe(true)
  })

  it('does not flag video with controls', () => {
    const el = document.createElement('video')
    el.setAttribute('controls', '')
    expect(isCanvasLikeElement(el)).toBe(false)
  })

  it('detects decorative svg without aria role', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    expect(isCanvasLikeElement(el as Element)).toBe(true)
  })

  it('does not flag svg with role + aria-label', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as Element
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', 'Avatar')
    expect(isCanvasLikeElement(el)).toBe(false)
  })

  it('does not flag plain divs', () => {
    expect(isCanvasLikeElement(document.createElement('div'))).toBe(false)
  })
})

describe('isHoverOnlyContext', () => {
  it('detects ancestor with class dropdown-menu', () => {
    const doc = parse(`<ul class="dropdown-menu"><li><a href="#">Account</a></li></ul>`)
    const link = doc.querySelector('a') as Element
    expect(isHoverOnlyContext(link)).toBe(true)
  })

  it('detects ancestor with role menu', () => {
    const doc = parse(`<div role="menu"><button>Edit</button></div>`)
    const btn = doc.querySelector('button') as Element
    expect(isHoverOnlyContext(btn)).toBe(true)
  })

  it('detects display:none ancestor wrapping all children', () => {
    const doc = parse(`<div><nav style="display:none"><a href="#">Profile</a></nav></div>`)
    const link = doc.querySelector('a') as Element
    expect(isHoverOnlyContext(link)).toBe(true)
  })

  it('does not flag plain navigation', () => {
    const doc = parse(`<header><nav><a href="#home">Home</a></nav></header>`)
    const link = doc.querySelector('a') as Element
    expect(isHoverOnlyContext(link)).toBe(false)
  })
})

describe('isPortalContext', () => {
  it('detects element rendered into div#modal-root', () => {
    const doc = parse(
      `<div id="root"></div><div id="modal-root"><div role="dialog"><button>OK</button></div></div>`,
    )
    const btn = doc.querySelector('button') as Element
    expect(isPortalContext(btn, doc)).toBe(true)
  })

  it('detects element under data-radix-portal', () => {
    const doc = parse(`<div data-radix-portal=""><div role="tooltip"><span>Hint</span></div></div>`)
    const span = doc.querySelector('span') as Element
    expect(isPortalContext(span, doc)).toBe(true)
  })

  it('does not flag elements within main app root', () => {
    const doc = parse(`<div id="root"><form><input id="x" /></form></div>`)
    const input = doc.querySelector('#x') as Element
    expect(isPortalContext(input, doc)).toBe(false)
  })
})

describe('detectEdgeCases (composite)', () => {
  it('returns canvas + portal when applicable', () => {
    const doc = parse(`<div id="modal-root"><canvas id="game"></canvas></div>`)
    const canvas = doc.querySelector('canvas') as Element
    const edges = detectEdgeCases(canvas, doc)
    const kinds = edges.map((e) => e.kind)
    expect(kinds).toContain('canvas')
    expect(kinds).toContain('portal')
  })

  it('returns empty list for plain elements', () => {
    const doc = parse(`<form><input id="x" /></form>`)
    expect(detectEdgeCases(doc.querySelector('input')!, doc)).toEqual([])
  })
})

describe('LocatorEngine edge case integration', () => {
  it('produces synthetic manual-coordinate locator for canvas', () => {
    const doc = parse(`<canvas id="game-stage"></canvas>`)
    const canvas = doc.querySelector('canvas') as Element
    const bundle = new LocatorEngine().evaluate(canvas, doc)
    expect(bundle).not.toBeNull()
    expect(bundle!.primary.warning).toBe('manual-coordinate-required')
    expect(bundle!.edgeCases?.[0]?.kind).toBe('canvas')
  })

  it('annotates hover-only elements without breaking primary locator', () => {
    const doc = parse(
      `<nav><ul class="dropdown-menu"><li><button data-testid="logout">Log out</button></li></ul></nav>`,
    )
    const btn = doc.querySelector('button') as Element
    const bundle = new LocatorEngine().evaluate(btn, doc)
    expect(bundle!.primary.strategy).toBe('testid')
    expect(bundle!.edgeCases?.some((e) => e.kind === 'hover-only')).toBe(true)
  })

  it('annotates portal elements but still produces a fallback locator', () => {
    const doc = parse(
      `<div id="root"></div><div id="modal-root"><div role="dialog"><button>Confirm</button></div></div>`,
    )
    const btn = doc.querySelector('button') as Element
    const bundle = new LocatorEngine().evaluate(btn, doc)
    expect(bundle).not.toBeNull()
    expect(bundle!.primary).toBeDefined()
    expect(bundle!.edgeCases?.some((e) => e.kind === 'portal')).toBe(true)
  })
})
