import { describe, it, expect, beforeEach } from 'vitest'
import { normalizeClickTarget, ancestorsFromComposedPath } from './normalize-click-target'
import { detectShadowContext } from './shadow-pierce'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('normalizeClickTarget', () => {
  it('promotes an icon path inside a button to the button', () => {
    document.body.innerHTML = `<button><svg><path id="p"/></svg></button>`
    const path = document.querySelector('#p')!
    expect(normalizeClickTarget(path).tagName).toBe('BUTTON')
  })

  it('promotes an <i> icon inside a button', () => {
    document.body.innerHTML = `<button><i class="icon-x" id="i"></i></button>`
    expect(normalizeClickTarget(document.querySelector('#i')!).tagName).toBe('BUTTON')
  })

  it('promotes text inside an anchor to the anchor', () => {
    document.body.innerHTML = `<a href="/x"><span id="s">Go</span></a>`
    expect(normalizeClickTarget(document.querySelector('#s')!).tagName).toBe('A')
  })

  it('promotes a child of a testid-bearing clickable card to the card', () => {
    document.body.innerHTML = `<div data-testid="card" role="button"><p id="t">Title</p></div>`
    const card = normalizeClickTarget(document.querySelector('#t')!)
    expect(card.getAttribute('data-testid')).toBe('card')
  })

  it('treats a plain testid container as actionable', () => {
    document.body.innerHTML = `<div data-testid="card"><span id="s">x</span></div>`
    expect(normalizeClickTarget(document.querySelector('#s')!).getAttribute('data-testid')).toBe(
      'card',
    )
  })

  it('never promotes a form control', () => {
    document.body.innerHTML = `<label for="cb">Accept</label><input id="cb" type="checkbox" />`
    const input = document.querySelector('#cb')!
    expect(normalizeClickTarget(input)).toBe(input)
  })

  it('is a no-op when the clicked element is already actionable', () => {
    document.body.innerHTML = `<button id="b">Save</button>`
    const btn = document.querySelector('#b')!
    expect(normalizeClickTarget(btn)).toBe(btn)
  })

  it('promotes to a label[for] (the label is the target, not its control)', () => {
    document.body.innerHTML = `<label for="cb"><span id="s">Accept terms</span></label><input id="cb" type="checkbox"/>`
    expect(normalizeClickTarget(document.querySelector('#s')!).tagName).toBe('LABEL')
  })

  it('does NOT over-promote deep body text with no actionable ancestor', () => {
    document.body.innerHTML = `<div><div><div><article><p id="t">Lorem ipsum</p></article></div></div></div>`
    const p = document.querySelector('#t')!
    expect(normalizeClickTarget(p)).toBe(p)
  })

  it('respects the climb depth bound (actionable ancestor too far up)', () => {
    document.body.innerHTML = `<button><div><div><div><div><span id="s">deep</span></div></div></div></div></button>`
    // span → 5 ancestors (div,div,div,div,button); button is at depth 5 > MAX_CLIMB(4).
    const span = document.querySelector('#s')!
    expect(normalizeClickTarget(span)).toBe(span)
  })

  it('promotes a div with role=link', () => {
    document.body.innerHTML = `<div role="link"><span id="s">Open</span></div>`
    expect(normalizeClickTarget(document.querySelector('#s')!).getAttribute('role')).toBe('link')
  })

  it('returns the closest actionable ancestor when several exist', () => {
    document.body.innerHTML = `<div data-testid="card"><div role="button" id="b"><span id="s">x</span></div></div>`
    const chosen = normalizeClickTarget(document.querySelector('#s')!)
    expect(chosen.getAttribute('role')).toBe('button') // closer than the testid card
  })

  it('falls back to parentElement when no ancestor list is given', () => {
    document.body.innerHTML = `<a href="/y"><b id="t">link</b></a>`
    expect(normalizeClickTarget(document.querySelector('#t')!).tagName).toBe('A')
  })
})

describe('ancestorsFromComposedPath + open shadow promotion', () => {
  it('promotes across an open shadow boundary and keeps shadow context', () => {
    const host = document.createElement('div')
    host.setAttribute('data-testid', 'widget')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const button = document.createElement('button')
    const svg = document.createElement('svg')
    const path = document.createElement('path')
    svg.appendChild(path)
    button.appendChild(svg)
    shadow.appendChild(button)

    // Simulated composedPath: leaf → … → shadow button → host → body.
    const composed = [path, svg, button, shadow, host, document.body] as unknown as EventTarget[]
    const ancestors = ancestorsFromComposedPath(path, composed)
    const promoted = normalizeClickTarget(path, ancestors)
    expect(promoted).toBe(button) // the shadow-internal button, reached via composedPath

    const ctx = detectShadowContext(promoted)
    expect(ctx).not.toBeNull()
    expect(ctx!.context.hostChain).toEqual(['[data-testid="widget"]'])
  })

  it('returns undefined for an empty composed path', () => {
    const el = document.createElement('div')
    expect(ancestorsFromComposedPath(el, [])).toBeUndefined()
  })
})
