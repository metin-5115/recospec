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

beforeEach(() => {
  sent.length = 0
  document.body.innerHTML = ''
  startCapture('sess-1')
})

afterEach(() => {
  stopCapture()
})

describe('event-capture — richer interactions', () => {
  it('records a <select> change as select with the chosen value and label', () => {
    document.body.innerHTML = `<select id="c"><option value="us">United States</option><option value="tr">Türkiye</option></select>`
    const select = document.querySelector('select')!
    select.value = 'tr'
    select.dispatchEvent(new Event('change', { bubbles: true }))

    expect(types()).toEqual(['select'])
    expect(sent[0].payload).toMatchObject({ value: 'tr', label: 'Türkiye' })
  })

  it('records a <textarea> change as fill', () => {
    document.body.innerHTML = `<textarea id="t"></textarea>`
    const ta = document.querySelector('textarea')!
    ta.value = 'hello'
    ta.dispatchEvent(new Event('change', { bubbles: true }))

    expect(types()).toEqual(['fill'])
    expect(sent[0].payload).toMatchObject({ value: 'hello' })
  })

  it('records a checkbox click as check, then uncheck — and no bogus fill', () => {
    document.body.innerHTML = `<input id="cb" type="checkbox" />`
    const cb = document.querySelector('input')!
    cb.click()
    cb.click()

    expect(types()).toEqual(['check', 'uncheck'])
  })

  it('records a radio click as check', () => {
    document.body.innerHTML = `<input id="r" type="radio" name="g" />`
    document.querySelector('input')!.click()

    expect(types()).toEqual(['check'])
  })

  it('does not double-record when a label toggles its checkbox', () => {
    document.body.innerHTML = `<label for="cb"><span id="txt">Accept</span></label><input id="cb" type="checkbox" />`
    document.querySelector<HTMLElement>('#txt')!.click()

    expect(types()).toEqual(['check'])
  })

  it('records a double click', () => {
    document.body.innerHTML = `<button id="b">Open</button>`
    document
      .querySelector('button')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }))

    expect(types()).toEqual(['dblclick'])
  })

  it('still records a plain input change as fill and a button click as click', () => {
    document.body.innerHTML = `<input id="i" type="text" /><button id="b">Go</button>`
    const input = document.querySelector('input')!
    input.value = 'abc'
    input.dispatchEvent(new Event('change', { bubbles: true }))
    document.querySelector('button')!.click()

    expect(types()).toEqual(['fill', 'click'])
  })
})
