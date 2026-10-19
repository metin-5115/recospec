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

import { NETWORK_CAPTURE_FLAG_KEY, PIERCE_CLOSED_SHADOW_FLAG_KEY } from '@shared/constants'
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

describe('event-capture — page flags', () => {
  it('raises the network capture flag while recording', () => {
    expect(window.localStorage.getItem(NETWORK_CAPTURE_FLAG_KEY)).toBe('true')
  })

  it('clears the network and closed-shadow flags on stop', () => {
    window.localStorage.setItem(PIERCE_CLOSED_SHADOW_FLAG_KEY, 'true')
    stopCapture()
    expect(window.localStorage.getItem(NETWORK_CAPTURE_FLAG_KEY)).toBeNull()
    expect(window.localStorage.getItem(PIERCE_CLOSED_SHADOW_FLAG_KEY)).toBeNull()
  })

  it('still stops cleanly when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => stopCapture()).not.toThrow()
    spy.mockRestore()
  })
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

describe('event-capture — file upload', () => {
  function chooseFiles(input: HTMLInputElement, names: string[]): void {
    const files = names.map((n) => new File(['x'], n))
    Object.defineProperty(input, 'files', { value: files, configurable: true })
    // Browsers expose the chosen path as `C:\fakepath\<name>`; jsdom has no such mangling.
    Object.defineProperty(input, 'value', {
      value: `C:\\fakepath\\${names[0]}`,
      configurable: true,
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  it('records a file input change as upload with file names only', () => {
    document.body.innerHTML = `<input id="f" type="file" />`
    chooseFiles(document.querySelector('input')!, ['avatar.png'])

    expect(types()).toEqual(['upload'])
    expect(sent[0].payload).toEqual({ fileNames: ['avatar.png'], multiple: false })
    expect(JSON.stringify(sent[0].payload)).not.toContain('fakepath')
  })

  it('records every chosen file and the multiple flag', () => {
    document.body.innerHTML = `<input id="f" type="file" multiple />`
    chooseFiles(document.querySelector('input')!, ['a.pdf', 'b.pdf'])

    expect(sent[0].payload).toEqual({ fileNames: ['a.pdf', 'b.pdf'], multiple: true })
  })

  it('does not record a fill when the file input is cleared', () => {
    document.body.innerHTML = `<input id="f" type="file" />`
    chooseFiles(document.querySelector('input')!, [])

    expect(types()).toEqual([])
  })

  it('does not record the click that opens the file dialog', () => {
    document.body.innerHTML = `<input id="f" type="file" />`
    document.querySelector('input')!.click()

    expect(types()).toEqual([])
  })
})
