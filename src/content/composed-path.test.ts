import { describe, it, expect, beforeEach } from 'vitest'
import { realTargetFromEvent } from './event-capture'
import { detectShadowContext } from './shadow-pierce'

/**
 * Open shadow roots: the click target the user sees is INSIDE the shadow root,
 * but `event.target` is retargeted to the host at the boundary. The recorder
 * must use `composedPath()[0]` to get the real element — and the resulting
 * element must still resolve to a shadow context.
 */

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('realTargetFromEvent — composedPath()[0]', () => {
  it('returns the real shadow-internal target, not the retargeted host', () => {
    const host = document.createElement('div')
    host.setAttribute('data-testid', 'widget')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const inner = document.createElement('button')
    inner.textContent = 'Buy'
    shadow.appendChild(inner)

    // Simulate the retargeting the browser performs: event.target is the host,
    // but composedPath starts at the real inner button.
    const fakeEvent = {
      composedPath: () => [inner, shadow, host, document.body] as EventTarget[],
      target: host,
    }
    expect(realTargetFromEvent(fakeEvent)).toBe(inner)

    // And the real target genuinely lives in a shadow context.
    const ctx = detectShadowContext(inner)
    expect(ctx).not.toBeNull()
    expect(ctx!.context.hostChain).toEqual(['[data-testid="widget"]'])
  })

  it('falls back to event.target for an empty composed path', () => {
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    expect(realTargetFromEvent({ composedPath: () => [], target: btn })).toBe(btn)
  })

  it('returns null when neither path nor target is an element', () => {
    expect(realTargetFromEvent({ composedPath: () => [], target: null })).toBeNull()
  })
})

describe('detectShadowContext — pierced flag', () => {
  it('marks the context pierced when the host carries the proxy stamp', () => {
    const host = document.createElement('div')
    host.setAttribute('id', 'panel')
    host.setAttribute('data-recospec-pierced', '')
    document.body.appendChild(host)
    // The MAIN-world proxy coerced a closed root to open; jsdom sees it open.
    const shadow = host.attachShadow({ mode: 'open' })
    const inner = document.createElement('input')
    shadow.appendChild(inner)

    const result = detectShadowContext(inner)
    expect(result).not.toBeNull()
    expect(result!.closed).toBe(true) // originally closed → user is warned
    expect(result!.context.pierced).toBe(true)
  })
})
