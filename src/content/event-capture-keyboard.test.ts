import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { CapturedEvent } from '@shared/types/action'

const sent: CapturedEvent[] = []

vi.mock('@shared/messaging/send', () => ({
  sendToBackground: vi.fn(async (msg: { type: string; event?: CapturedEvent }) => {
    if (msg.type === 'EVENT_CAPTURED' && msg.event) sent.push(msg.event)
  }),
}))

vi.mock('./spinner-detector', () => ({
  observeForSpinner: vi.fn(async () => null),
}))

import { startCapture, stopCapture } from './event-capture'

function types(): string[] {
  return sent.map((e) => e.type)
}

function press(target: Element, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init }),
  )
}

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.focus()
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  sent.length = 0
  document.body.innerHTML = ''
  startCapture('sess-1')
})

afterEach(() => {
  stopCapture()
})

describe('event-capture — keyboard', () => {
  it('records Enter after typing as fill then keypress, and the late change adds nothing', () => {
    document.body.innerHTML = `<input id="q" type="text" />`
    const input = document.querySelector('input')!
    type(input, 'shoes')
    press(input, 'Enter')
    input.dispatchEvent(new Event('change', { bubbles: true }))

    expect(types()).toEqual(['fill', 'keypress'])
    expect(sent[0].payload).toMatchObject({ value: 'shoes' })
    expect(sent[1].payload).toEqual({ key: 'Enter' })
  })

  it('records a lone Enter when there is no pending edit', () => {
    document.body.innerHTML = `<input id="q" type="text" value="shoes" />`
    const input = document.querySelector('input')!
    input.focus()
    press(input, 'Enter')

    expect(types()).toEqual(['keypress'])
  })

  it('records Tab after typing as fill then keypress', () => {
    document.body.innerHTML = `<input id="a" type="text" />`
    const input = document.querySelector('input')!
    type(input, 'abc')
    press(input, 'Tab')
    input.dispatchEvent(new Event('change', { bubbles: true }))

    expect(types()).toEqual(['fill', 'keypress'])
    expect(sent[1].payload).toEqual({ key: 'Tab' })
  })

  it('records Escape', () => {
    document.body.innerHTML = `<div id="modal" tabindex="0">x</div>`
    press(document.querySelector('#modal')!, 'Escape')

    expect(types()).toEqual(['keypress'])
    expect(sent[0].payload).toEqual({ key: 'Escape' })
  })

  it('records a genuinely new edit after a flushed one', () => {
    document.body.innerHTML = `<input id="q" type="text" />`
    const input = document.querySelector('input')!
    type(input, 'one')
    press(input, 'Enter')
    input.dispatchEvent(new Event('change', { bubbles: true }))
    type(input, 'two')
    input.dispatchEvent(new Event('change', { bubbles: true }))

    expect(types()).toEqual(['fill', 'keypress', 'fill'])
    expect(sent[2].payload).toMatchObject({ value: 'two' })
  })

  it('ignores keys whose value already arrives through change', () => {
    document.body.innerHTML = `<input id="q" type="text" />`
    const input = document.querySelector('input')!
    for (const key of ['a', 'A', ' ', 'Backspace', 'ArrowDown', 'Shift', 'F5']) press(input, key)

    expect(types()).toEqual([])
  })

  it('ignores chords and IME composition', () => {
    document.body.innerHTML = `<input id="q" type="text" />`
    const input = document.querySelector('input')!
    press(input, 'Enter', { ctrlKey: true })
    press(input, 'Enter', { metaKey: true })
    press(input, 'Tab', { shiftKey: true })
    press(input, 'Enter', { isComposing: true })
    press(input, 'Enter', { repeat: true })

    expect(types()).toEqual([])
  })

  it('does not record Enter in a textarea (it inserts a newline)', () => {
    document.body.innerHTML = `<textarea id="t"></textarea>`
    press(document.querySelector('textarea')!, 'Enter')

    expect(types()).toEqual([])
  })

  it('does not record Enter that activates a button, link or toggle (the click is recorded)', () => {
    document.body.innerHTML = `
      <button id="b">Go</button>
      <a id="a" href="/x">Link</a>
      <input id="s" type="submit" value="Send" />
      <input id="c" type="checkbox" />`
    for (const el of document.querySelectorAll('button, a, input')) press(el, 'Enter')

    expect(types()).toEqual([])
  })

  it('records Enter on a password field without carrying typed characters in the keypress', () => {
    document.body.innerHTML = `<input id="p" type="password" />`
    const input = document.querySelector('input')!
    type(input, 'hunter2')
    press(input, 'Enter')

    const keypress = sent.find((e) => e.type === 'keypress')!
    expect(keypress.payload).toEqual({ key: 'Enter' })
    expect(JSON.stringify(keypress)).not.toContain('hunter2')
  })

  it('stops listening once capture stops', () => {
    document.body.innerHTML = `<input id="q" type="text" />`
    const input = document.querySelector('input')!
    stopCapture()
    press(input, 'Enter')
    press(input, 'Escape')

    expect(types()).toEqual([])
  })

  it('does not stack listeners across repeated start/stop cycles', () => {
    document.body.innerHTML = `<div id="m" tabindex="0">x</div>`
    stopCapture()
    startCapture('sess-2')
    startCapture('sess-2')
    press(document.querySelector('#m')!, 'Escape')

    expect(types()).toEqual(['keypress'])
  })
})
