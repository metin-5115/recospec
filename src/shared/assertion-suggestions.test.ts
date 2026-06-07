import { describe, it, expect } from 'vitest'
import { suggestionsForSnapshot } from './assertion-suggestions'
import type { ElementSnapshot } from './types/action'

const buttonSnap: ElementSnapshot = {
  tagName: 'button',
  attributes: { id: 'go' },
  textContent: 'Submit',
}

const inputSnap: ElementSnapshot = {
  tagName: 'input',
  attributes: { type: 'text', value: 'alice' },
  textContent: '',
}

describe('suggestionsForSnapshot', () => {
  it('always offers visible + hidden + screenshot', () => {
    const types = suggestionsForSnapshot(buttonSnap, 'Form').map((s) => s.type)
    expect(types).toContain('visible')
    expect(types).toContain('hidden')
    expect(types).toContain('screenshot')
  })

  it('includes a text assertion when the snapshot has text', () => {
    const list = suggestionsForSnapshot(buttonSnap, 'Form')
    const text = list.find((s) => s.type === 'text')
    expect(text).toBeDefined()
    expect(text?.expected).toBe('Submit')
  })

  it('includes a text-contains assertion alongside the exact text match', () => {
    const list = suggestionsForSnapshot(buttonSnap, 'Form')
    const contains = list.find((s) => s.type === 'text-contains')
    expect(contains).toBeDefined()
    expect(contains?.expected).toBe('Submit')
    expect(contains?.label).toContain('contains')
  })

  it('omits text-contains when the snapshot has no text', () => {
    const list = suggestionsForSnapshot(inputSnap, 'Login')
    expect(list.find((s) => s.type === 'text-contains')).toBeUndefined()
  })

  it('includes a value assertion for inputs, preferring the live current value', () => {
    const list = suggestionsForSnapshot(inputSnap, 'Login', 'live-value')
    const value = list.find((s) => s.type === 'value')
    expect(value?.expected).toBe('live-value')
  })

  it('falls back to the snapshot value attribute when no live value is supplied', () => {
    const list = suggestionsForSnapshot(inputSnap, 'Login')
    const value = list.find((s) => s.type === 'value')
    expect(value?.expected).toBe('alice')
  })

  it('slugifies the page title for the screenshot file name', () => {
    const list = suggestionsForSnapshot(buttonSnap, 'Hello / World!  Test')
    const screenshot = list.find((s) => s.type === 'screenshot')
    expect(screenshot?.name).toBe('hello-world-test')
  })

  it('defaults the screenshot name to "snapshot" when the page title is empty', () => {
    const list = suggestionsForSnapshot(buttonSnap, '')
    const screenshot = list.find((s) => s.type === 'screenshot')
    expect(screenshot?.name).toBe('snapshot')
  })
})
