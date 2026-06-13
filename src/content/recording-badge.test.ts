/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isBadgeMounted, mountBadge, unmountBadge } from './recording-badge'

const HOST_ID = 'recospec-recording-badge-host'

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  unmountBadge()
})

describe('recording-badge', () => {
  it('mounts a host element with a closed shadow root', () => {
    mountBadge()
    const host = document.getElementById(HOST_ID)
    expect(host).toBeTruthy()
    expect(host?.parentElement).toBe(document.body)
    // `closed` mode means shadowRoot is not exposed on the element.
    expect((host as HTMLElement).shadowRoot).toBeNull()
    expect(isBadgeMounted()).toBe(true)
  })

  it('pins the host above page stacking contexts', () => {
    mountBadge()
    const host = document.getElementById(HOST_ID) as HTMLElement
    expect(host.style.position).toBe('fixed')
    expect(host.style.zIndex).toBe('2147483647')
  })

  it('is idempotent — repeat mounts produce a single instance', () => {
    mountBadge()
    mountBadge()
    mountBadge()
    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1)
  })

  it('unmounts cleanly and is a no-op if no badge is present', () => {
    mountBadge()
    expect(isBadgeMounted()).toBe(true)
    unmountBadge()
    expect(document.getElementById(HOST_ID)).toBeNull()
    expect(isBadgeMounted()).toBe(false)
    // Calling again must not throw.
    expect(() => unmountBadge()).not.toThrow()
  })

  it('skips mounting when not in the top frame', () => {
    const originalTop = window.top
    // Pretend we are a nested frame: `window !== window.top`.
    Object.defineProperty(window, 'top', {
      configurable: true,
      get: () => ({}) as Window,
    })
    try {
      mountBadge()
      expect(document.getElementById(HOST_ID)).toBeNull()
      expect(isBadgeMounted()).toBe(false)
    } finally {
      Object.defineProperty(window, 'top', {
        configurable: true,
        get: () => originalTop,
      })
    }
  })
})
