/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  findSpinnerInMutations,
  observeForSpinner,
  shouldQualifyAsSpinner,
} from './spinner-detector'

function makeMutationRecord(partial: Partial<MutationRecord>): MutationRecord {
  const empty: MutationRecord = {
    type: 'childList',
    target: document.body,
    addedNodes: [] as unknown as NodeList,
    removedNodes: [] as unknown as NodeList,
    previousSibling: null,
    nextSibling: null,
    attributeName: null,
    attributeNamespace: null,
    oldValue: null,
  }
  return { ...empty, ...partial } as MutationRecord
}

function nodeListOf(elements: Element[]): NodeList {
  // Re-use a NodeList by attaching the elements to a detached parent.
  const host = document.createElement('div')
  for (const el of elements) host.appendChild(el)
  return host.childNodes
}

describe('shouldQualifyAsSpinner', () => {
  it('matches role=progressbar', () => {
    const el = document.createElement('div')
    el.setAttribute('role', 'progressbar')
    expect(shouldQualifyAsSpinner(el)).toBe(true)
  })

  it('matches .spinner class', () => {
    const el = document.createElement('div')
    el.className = 'spinner'
    expect(shouldQualifyAsSpinner(el)).toBe(true)
  })

  it('matches .loading class', () => {
    const el = document.createElement('div')
    el.className = 'loading'
    expect(shouldQualifyAsSpinner(el)).toBe(true)
  })

  it('matches aria-busy=true', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-busy', 'true')
    expect(shouldQualifyAsSpinner(el)).toBe(true)
  })

  it('returns false for unrelated elements', () => {
    const el = document.createElement('span')
    el.className = 'foo'
    expect(shouldQualifyAsSpinner(el)).toBe(false)
  })

  it('returns true when a descendant qualifies', () => {
    const wrapper = document.createElement('div')
    const inner = document.createElement('div')
    inner.className = 'spinner'
    wrapper.appendChild(inner)
    expect(shouldQualifyAsSpinner(wrapper)).toBe(true)
  })

  it('rejects non-element nodes', () => {
    const text = document.createTextNode('hello')
    expect(shouldQualifyAsSpinner(text)).toBe(false)
  })
})

describe('findSpinnerInMutations', () => {
  it('returns a directly-added spinner node', () => {
    const el = document.createElement('div')
    el.setAttribute('role', 'progressbar')
    const records = [makeMutationRecord({ addedNodes: nodeListOf([el]) })]
    expect(findSpinnerInMutations(records)).toBe(el)
  })

  it('returns the inner spinner when added wrapper has one', () => {
    const wrapper = document.createElement('div')
    const inner = document.createElement('div')
    inner.className = 'loading'
    wrapper.appendChild(inner)
    const records = [makeMutationRecord({ addedNodes: nodeListOf([wrapper]) })]
    expect(findSpinnerInMutations(records)).toBe(inner)
  })

  it('detects aria-busy flips to true', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-busy', 'true')
    const records = [
      makeMutationRecord({
        type: 'attributes',
        target: el,
        attributeName: 'aria-busy',
      }),
    ]
    expect(findSpinnerInMutations(records)).toBe(el)
  })

  it('ignores aria-busy=false flips', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-busy', 'false')
    const records = [
      makeMutationRecord({
        type: 'attributes',
        target: el,
        attributeName: 'aria-busy',
      }),
    ]
    expect(findSpinnerInMutations(records)).toBeNull()
  })

  it('returns null when nothing qualifies', () => {
    const span = document.createElement('span')
    const records = [makeMutationRecord({ addedNodes: nodeListOf([span]) })]
    expect(findSpinnerInMutations(records)).toBeNull()
  })
})

describe('observeForSpinner', () => {
  let host: HTMLElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    host.remove()
  })

  it('resolves with the spinner once it is appended', async () => {
    const promise = observeForSpinner({ timeoutMs: 1000, root: host })
    queueMicrotask(() => {
      const spinner = document.createElement('div')
      spinner.setAttribute('role', 'progressbar')
      host.appendChild(spinner)
    })
    const result = await promise
    expect(result).not.toBeNull()
    expect(result?.getAttribute('role')).toBe('progressbar')
  })

  it('resolves with null on timeout', async () => {
    const result = await observeForSpinner({ timeoutMs: 20, root: host })
    expect(result).toBeNull()
  })

  it('resolves with null when aborted', async () => {
    const ctrl = new AbortController()
    const promise = observeForSpinner({ timeoutMs: 1000, root: host }, ctrl.signal)
    ctrl.abort()
    expect(await promise).toBeNull()
  })
})
