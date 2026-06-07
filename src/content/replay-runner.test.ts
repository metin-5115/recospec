/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeReplayStep, resolveElement } from './replay-runner'
import type { Locator } from '@shared/types/locator'

const primary = (selector: string): Locator => ({
  strategy: 'css',
  selector,
  framework: {},
})

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveElement', () => {
  it('returns the unique primary match', () => {
    document.body.innerHTML = '<button id="go">Go</button>'
    const el = resolveElement({
      actionType: 'click',
      primary: primary('#go'),
      fallbacks: [],
    })
    expect(el).toBeInstanceOf(HTMLButtonElement)
  })

  it('falls back to the next locator when primary misses', () => {
    document.body.innerHTML = '<button data-testid="go">Go</button>'
    const el = resolveElement({
      actionType: 'click',
      primary: primary('#nope'),
      fallbacks: [primary('[data-testid="go"]')],
    })
    expect(el).toBeInstanceOf(HTMLButtonElement)
  })

  it('accepts a multi-match fallback rather than giving up', () => {
    document.body.innerHTML = '<button class="btn">A</button><button class="btn">B</button>'
    const el = resolveElement({
      actionType: 'click',
      primary: primary('#nope'),
      fallbacks: [primary('.btn')],
    })
    // Soft-success path: takes the first match when none of the locators
    // resolve uniquely. Better than failing the whole replay.
    expect(el).toBeInstanceOf(HTMLButtonElement)
    expect(el?.textContent).toBe('A')
  })

  it('returns null when nothing matches', () => {
    document.body.innerHTML = '<div />'
    const el = resolveElement({
      actionType: 'click',
      primary: primary('#nope'),
      fallbacks: [primary('.also-nope')],
    })
    expect(el).toBeNull()
  })
})

describe('executeReplayStep — DOM action dispatch', () => {
  it('clicks a button and reports pass', () => {
    document.body.innerHTML = '<button id="go">Go</button>'
    const btn = document.getElementById('go') as HTMLButtonElement
    const onClick = vi.fn()
    btn.addEventListener('click', onClick)
    const outcome = executeReplayStep({
      actionType: 'click',
      primary: primary('#go'),
      fallbacks: [],
    })
    expect(outcome.status).toBe('pass')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('fills an input by going through the native setter (React-safe)', () => {
    document.body.innerHTML = '<input id="email" type="text" />'
    const input = document.getElementById('email') as HTMLInputElement
    const inputs: string[] = []
    input.addEventListener('input', () => inputs.push(input.value))
    const changes: string[] = []
    input.addEventListener('change', () => changes.push(input.value))
    const outcome = executeReplayStep({
      actionType: 'fill',
      primary: primary('#email'),
      fallbacks: [],
      payload: { value: 'alice@example.com' },
    })
    expect(outcome.status).toBe('pass')
    expect(input.value).toBe('alice@example.com')
    expect(inputs).toEqual(['alice@example.com'])
    expect(changes).toEqual(['alice@example.com'])
  })

  it('reports fail when no element resolves', () => {
    document.body.innerHTML = '<div />'
    const outcome = executeReplayStep({
      actionType: 'click',
      primary: primary('#missing'),
      fallbacks: [],
    })
    expect(outcome.status).toBe('fail')
    expect(outcome.error).toMatch(/did not resolve/i)
  })

  it('skips assert / wait / network steps', () => {
    document.body.innerHTML = '<div />'
    for (const actionType of ['assert', 'wait', 'network', 'screenshot'] as const) {
      const outcome = executeReplayStep({
        actionType,
        primary: primary('div'),
        fallbacks: [],
      })
      expect(outcome.status).toBe('skipped')
    }
  })

  it('selects an option by value', () => {
    document.body.innerHTML = `
      <select id="country">
        <option value="us">United States</option>
        <option value="tr">Türkiye</option>
      </select>
    `
    const outcome = executeReplayStep({
      actionType: 'select',
      primary: primary('#country'),
      fallbacks: [],
      payload: { value: 'tr' },
    })
    expect(outcome.status).toBe('pass')
    const select = document.getElementById('country') as HTMLSelectElement
    expect(select.value).toBe('tr')
  })

  it('fails fill when the locator points at a non-input element', () => {
    document.body.innerHTML = '<div id="x">not an input</div>'
    const outcome = executeReplayStep({
      actionType: 'fill',
      primary: primary('#x'),
      fallbacks: [],
      payload: { value: 'hi' },
    })
    expect(outcome.status).toBe('fail')
    expect(outcome.error).toMatch(/Cannot fill/i)
  })
})
