import { describe, it, expect, beforeEach } from 'vitest'
import { LocatorEngine } from './index'
import { scopeDocumentTo } from './pipeline/scope'

const engine = new LocatorEngine()

function shadowOf(host: Element, html: string): ShadowRoot {
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = html
  return root
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('scopeDocumentTo', () => {
  it('returns the document untouched for a light-DOM element', () => {
    document.body.innerHTML = '<button id="b">x</button>'
    const el = document.getElementById('b')!
    expect(scopeDocumentTo(el, document)).toBe(document)
  })

  it('routes queries to the element’s shadow root', () => {
    document.body.innerHTML = '<button class="x">light</button>'
    const host = document.createElement('my-card')
    document.body.appendChild(host)
    const root = shadowOf(host, '<button class="x" id="in">shadow</button>')
    const inner = root.getElementById('in')!

    const scoped = scopeDocumentTo(inner, document)
    expect(scoped.querySelectorAll('button.x')).toHaveLength(1)
    expect(scoped.querySelector('button.x')).toBe(inner)
    expect(scoped.getElementById('in')).toBe(inner)
    // Non-query members still come from the real document.
    expect(scoped.documentElement).toBe(document.documentElement)
    expect(scoped.createElement('div').ownerDocument).toBe(document)
  })

  it('scopes a nested shadow root to the innermost one', () => {
    const outer = document.createElement('outer-el')
    document.body.appendChild(outer)
    const outerRoot = shadowOf(outer, '<inner-el></inner-el><button class="x">outer</button>')
    const innerRoot = shadowOf(
      outerRoot.querySelector('inner-el')!,
      '<button class="x">inner</button>',
    )
    const innerBtn = innerRoot.querySelector('button')!

    const scoped = scopeDocumentTo(innerBtn, document)
    expect(scoped.querySelectorAll('button.x')).toHaveLength(1)
    expect(scoped.querySelector('button.x')).toBe(innerBtn)
  })
})

describe('LocatorEngine — elements inside an open shadow root', () => {
  it('produces a bundle (not null) for a shadow-DOM element', () => {
    const host = document.createElement('my-card')
    document.body.appendChild(host)
    const root = shadowOf(host, '<button data-testid="save">Save</button>')
    const bundle = engine.evaluate(root.querySelector('button')!, document)
    expect(bundle).not.toBeNull()
  })

  it('counts uniqueness inside the shadow root, ignoring light-DOM twins', () => {
    document.body.innerHTML = '<button data-testid="save">Save</button>'
    const host = document.createElement('my-card')
    document.body.appendChild(host)
    const root = shadowOf(host, '<button data-testid="save">Save</button><button>Cancel</button>')
    const target = root.querySelector('[data-testid="save"]')!

    const bundle = engine.evaluate(target, document)!
    expect(bundle.primary.strategy).toBe('testid')
    expect(bundle.primary.matchCount).toBe(1)
  })

  it('disambiguates identical shadow siblings with a locator unique in that root', () => {
    const host = document.createElement('my-form')
    document.body.appendChild(host)
    const root = shadowOf(host, '<input name="q"><input name="q">')
    const second = root.querySelectorAll('input')[1]!

    const bundle = engine.evaluate(second, document)!
    expect(bundle).not.toBeNull()
    expect(bundle.primary.matchCount).toBe(1)
    expect(bundle.primary.strategy).not.toBe('xpath')
  })

  it('keeps light-DOM results unchanged', () => {
    document.body.innerHTML = '<button data-testid="go">Go</button>'
    const bundle = engine.evaluate(document.querySelector('button')!, document)!
    expect(bundle.primary.strategy).toBe('testid')
    expect(bundle.primary.matchCount).toBe(1)
  })
})
