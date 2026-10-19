import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  startTextMutationTracking,
  stopTextMutationTracking,
  wasTextMutated,
} from './text-mutation-tracker'

afterEach(() => {
  stopTextMutationTracking()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('text-mutation-tracker', () => {
  it('still flags an element the moment it is asked about, even before the frame callback runs', async () => {
    document.body.innerHTML = '<div id="clock"><span id="t">10:00</span></div>'
    startTextMutationTracking()
    const span = document.getElementById('t') as HTMLElement

    span.firstChild!.textContent = '10:01'

    // MutationObserver callbacks are microtasks; the batched work waits for a frame, but a
    // question about the element must not miss a change that happened just before it.
    expect(wasTextMutated(span)).toBe(true)
    expect(wasTextMutated(span.parentElement as HTMLElement)).toBe(true)
  })

  it('does not flag elements whose text never changed', () => {
    document.body.innerHTML = '<p id="a">static</p><p id="b">other</p>'
    startTextMutationTracking()
    document.getElementById('b')!.firstChild!.textContent = 'changed'
    expect(wasTextMutated(document.getElementById('a') as HTMLElement)).toBe(false)
  })

  it('processes a burst of mutations in one frame, not one pass per callback', async () => {
    document.body.innerHTML = '<div id="d"><span>1</span></div>'
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    startTextMutationTracking()
    const text = document.querySelector('span')!.firstChild as Text

    for (let i = 0; i < 5; i++) {
      text.data = `v${i}`
      await Promise.resolve()
    }
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(frames).toHaveLength(1)
  })

  it('schedules a fresh frame after a restart even if the previous frame never ran', async () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    document.body.innerHTML = '<div id="d"><span>1</span></div>'
    startTextMutationTracking()
    document.querySelector('span')!.firstChild!.textContent = '2'
    await new Promise((resolve) => setTimeout(resolve, 0))
    stopTextMutationTracking()

    startTextMutationTracking()
    document.querySelector('span')!.firstChild!.textContent = '3'
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(frames).toHaveLength(2)
  })
})
