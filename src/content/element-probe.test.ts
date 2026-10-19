import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('@shared/messaging/send', () => ({ sendToBackground: vi.fn(async () => undefined) }))

import { startProbe, stopProbe } from './element-probe'

const nextFrame = () =>
  new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
const overlays = () => document.querySelectorAll('body > div[style*="z-index"]')

afterEach(() => {
  stopProbe()
  document.body.innerHTML = ''
})

describe('element-probe overlay', () => {
  it('moves one overlay instead of creating a new one on every mouseover', async () => {
    document.body.innerHTML = '<button id="a">A</button><button id="b">B</button>'
    startProbe('s1')

    for (const id of ['a', 'b', 'a', 'b']) {
      document
        .getElementById(id)!
        .dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true }))
    }
    await nextFrame()

    expect(overlays()).toHaveLength(1)
  })

  it('removes the overlay when the probe stops', async () => {
    document.body.innerHTML = '<button id="a">A</button>'
    startProbe('s1')
    document.getElementById('a')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await nextFrame()
    stopProbe()
    expect(overlays()).toHaveLength(0)
  })
})
