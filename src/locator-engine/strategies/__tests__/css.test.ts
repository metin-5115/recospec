import { describe, it, expect, beforeEach } from 'vitest'
import { CssStrategy } from '../css'

const strategy = new CssStrategy()

describe('CssStrategy', () => {
  let doc: Document

  beforeEach(() => {
    doc = document
    document.body.innerHTML = ''
  })

  it('builds selector from name attribute', () => {
    const el = document.createElement('input')
    el.setAttribute('name', 'username')
    document.body.appendChild(el)

    const result = strategy.evaluate(el, doc)
    expect(result!.selector).toBe('input[name="username"]')
  })

  it('uses static classes and excludes dynamic ones', () => {
    const el = document.createElement('button')
    el.className = 'btn-primary MuiButton-root css-1a2b3c'
    document.body.appendChild(el)

    const result = strategy.evaluate(el, doc)
    expect(result!.selector).toContain('btn-primary')
    expect(result!.selector).not.toContain('MuiButton-root')
    expect(result!.selector).not.toContain('css-1a2b3c')
  })

  it('falls back to parent > tag when no unique attributes or classes', () => {
    const form = document.createElement('form')
    const btn = document.createElement('button')
    form.appendChild(btn)
    document.body.appendChild(form)

    const result = strategy.evaluate(btn, doc)
    expect(result!.selector).toContain('form')
    expect(result!.selector).toContain('button')
  })

  it('uses nth-of-type when multiple siblings share same tag', () => {
    const div = document.createElement('div')
    const btn1 = document.createElement('button')
    const btn2 = document.createElement('button')
    div.appendChild(btn1)
    div.appendChild(btn2)
    document.body.appendChild(div)

    const result = strategy.evaluate(btn2, doc)
    expect(result!.selector).toContain('nth-of-type(2)')
  })

  it('builds selector from type and placeholder', () => {
    const el = document.createElement('input')
    el.setAttribute('type', 'email')
    el.setAttribute('placeholder', 'Enter email')
    document.body.appendChild(el)

    const result = strategy.evaluate(el, doc)
    expect(result!.selector).toBe('input[type="email"][placeholder="Enter email"]')
  })
})

describe('CssStrategy — non-unique attributes fall through to a positional selector', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('does not stop at a name shared by several elements', () => {
    document.body.innerHTML = '<form><input name="q"><input name="q"></form>'
    const second = document.querySelectorAll('input')[1]!
    const selector = strategy.evaluate(second, document)!.selector as string
    expect(document.querySelectorAll(selector)).toHaveLength(1)
    expect(document.querySelector(selector)).toBe(second)
  })

  it('keeps the attribute selector when it is already unique', () => {
    document.body.innerHTML = '<form><input name="a"><input name="b"></form>'
    const second = document.querySelectorAll('input')[1]!
    expect(strategy.evaluate(second, document)!.selector).toBe('input[name="b"]')
  })

  it('addresses a top-level element inside a shadow root positionally', () => {
    const host = document.createElement('x-host')
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = '<button>A</button><button>A</button>'
    const second = root.querySelectorAll('button')[1]!
    const scoped = {
      querySelectorAll: (s: string) => root.querySelectorAll(s),
    } as unknown as Document
    const selector = strategy.evaluate(second, scoped)!.selector as string
    expect(Array.from(root.querySelectorAll(selector))).toEqual([second])
  })
})
