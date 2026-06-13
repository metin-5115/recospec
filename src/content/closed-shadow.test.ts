import { describe, it, expect, beforeEach } from 'vitest'
import { installClosedShadowProxy, type ShadowAttachable } from './closed-shadow'

/**
 * jsdom supports `attachShadow`, so the opt-in piercing logic is exercised
 * against a real prototype. Each test installs on a fresh host element's
 * prototype-like target to avoid cross-test wrapper leakage.
 */

beforeEach(() => {
  document.body.innerHTML = ''
})

function freshHost(): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host
}

describe('installClosedShadowProxy — opt-in piercing', () => {
  it('OFF by default: a closed root stays closed (host.shadowRoot is null)', () => {
    // Install on a per-element clone of the proto contract so we do not mutate
    // the shared Element.prototype across tests.
    const host = freshHost()
    const target: ShadowAttachable = {
      attachShadow: host.attachShadow.bind(host),
    }
    const handle = installClosedShadowProxy(target, { pierce: false })

    const root = target.attachShadow({ mode: 'closed' })
    expect(root.mode).toBe('closed')
    expect(host.shadowRoot).toBeNull() // page-observable behaviour unchanged
    expect(handle.wasClosed(target)).toBe(true)
    handle.uninstall()
  })

  it('ON: a closed root is coerced open and becomes reachable', () => {
    const host = freshHost()
    const target: ShadowAttachable = {
      attachShadow: host.attachShadow.bind(host),
    }
    const handle = installClosedShadowProxy(target, { pierce: true })

    const root = target.attachShadow({ mode: 'closed' })
    expect(root.mode).toBe('open') // coerced
    expect(host.shadowRoot).not.toBeNull() // now reachable
    expect(handle.wasClosed(target)).toBe(true)
    expect(handle.getClosedRoot(target)).toBe(root)
    handle.uninstall()
  })

  it('leaves OPEN roots untouched regardless of the flag', () => {
    const host = freshHost()
    const target: ShadowAttachable = {
      attachShadow: host.attachShadow.bind(host),
    }
    const handle = installClosedShadowProxy(target, { pierce: true })

    const root = target.attachShadow({ mode: 'open' })
    expect(root.mode).toBe('open')
    expect(handle.wasClosed(target)).toBe(false)
    handle.uninstall()
  })

  it('uninstall restores the original attachShadow', () => {
    const host = freshHost()
    const original = host.attachShadow.bind(host)
    const target: ShadowAttachable = { attachShadow: original }
    const handle = installClosedShadowProxy(target, { pierce: true })
    expect(target.attachShadow).not.toBe(original)
    handle.uninstall()
    expect(target.attachShadow).toBe(original)
  })

  it('installing twice does not double-wrap', () => {
    const host = freshHost()
    const target: ShadowAttachable = { attachShadow: host.attachShadow.bind(host) }
    installClosedShadowProxy(target, { pierce: true })
    const afterFirst = target.attachShadow
    installClosedShadowProxy(target, { pierce: true })
    expect(target.attachShadow).toBe(afterFirst)
  })
})
