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
