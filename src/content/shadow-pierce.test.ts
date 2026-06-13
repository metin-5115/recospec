import { describe, it, expect } from 'vitest'
import { detectShadowContext, detectFrameContext } from './shadow-pierce'

describe('detectShadowContext', () => {
  it('returns null for an element not inside a shadow root', () => {
    const el = document.createElement('button')
    document.body.appendChild(el)
    expect(detectShadowContext(el)).toBeNull()
    el.remove()
  })

  it('detects an open shadow root and returns the host selector', () => {
    const host = document.createElement('div')
    host.setAttribute('data-testid', 'my-widget')
    document.body.appendChild(host)

    const shadow = host.attachShadow({ mode: 'open' })
    const inner = document.createElement('button')
    shadow.appendChild(inner)

    const result = detectShadowContext(inner)
    expect(result).not.toBeNull()
    expect(result!.closed).toBe(false)
    expect(result!.context.hostChain).toEqual(['[data-testid="my-widget"]'])

    host.remove()
  })

  it('sets closed=true for a closed shadow root', () => {
    const host = document.createElement('div')
    host.setAttribute('id', 'closed-host')
    document.body.appendChild(host)

    const shadow = host.attachShadow({ mode: 'closed' })
    const inner = document.createElement('span')
    shadow.appendChild(inner)

    const result = detectShadowContext(inner)
    expect(result).not.toBeNull()
    expect(result!.closed).toBe(true)
    expect(result!.context.hostChain.length).toBeGreaterThan(0)

    host.remove()
  })

  it('builds a multi-level host chain for nested shadow roots', () => {
    const outerHost = document.createElement('div')
    outerHost.setAttribute('id', 'outer')
    document.body.appendChild(outerHost)

    const outerShadow = outerHost.attachShadow({ mode: 'open' })
    const innerHost = document.createElement('section')
    innerHost.setAttribute('data-testid', 'inner-host')
    outerShadow.appendChild(innerHost)

    const innerShadow = innerHost.attachShadow({ mode: 'open' })
    const deepEl = document.createElement('input')
    innerShadow.appendChild(deepEl)

    const result = detectShadowContext(deepEl)
    expect(result).not.toBeNull()
    expect(result!.context.hostChain).toHaveLength(2)
    expect(result!.context.hostChain[0]).toContain('outer')
    expect(result!.context.hostChain[1]).toContain('inner-host')

    outerHost.remove()
  })
})

describe('detectFrameContext', () => {
  it('returns null when running in the top-level document', () => {
    // jsdom sets window === window.top
    expect(detectFrameContext()).toBeNull()
  })

  it('returns a FrameContext when window.top differs from window', () => {
    const originalTop = Object.getOwnPropertyDescriptor(window, 'top')

    // Simulate being inside an iframe by making window.top a different object
    const fakeTop = {} as Window
    Object.defineProperty(window, 'top', { get: () => fakeTop, configurable: true })

    const result = detectFrameContext()
    expect(result).not.toBeNull()
    expect(result!.frameChain).toBeInstanceOf(Array)

    if (originalTop) {
      Object.defineProperty(window, 'top', originalTop)
    }
  })
})
