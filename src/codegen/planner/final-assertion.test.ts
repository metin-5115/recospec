import { describe, it, expect } from 'vitest'
import { appendFinalStateAssertion } from './final-assertion'
import type { IRElement, IRStep } from '../ir/types'

const button: IRElement = {
  name: 'saveBtn',
  locatorStrategy: 'testid',
  locatorValue: 'save',
  tagName: 'button',
}

const click = (id: string, pageUrl?: string): IRStep => ({
  id,
  action: 'click',
  element: button,
  pageUrl,
})

describe('appendFinalStateAssertion', () => {
  it('appends a url assertion for the route the flow ended on', () => {
    const out = appendFinalStateAssertion([click('a', '/cart'), click('b', '/orders/:id')])
    const last = out[out.length - 1]
    expect(last?.action).toBe('assert')
    expect(last?.assertionDetail).toEqual({ type: 'url', expected: '/orders/:id' })
    expect(last?.pageUrl).toBe('/orders/:id')
    expect(out).toHaveLength(3)
  })

  it('uses the target of a trailing navigate step', () => {
    const out = appendFinalStateAssertion([
      click('a', '/cart'),
      { id: 'n', action: 'navigate', url: '/thanks' },
    ])
    expect(out[out.length - 1]?.assertionDetail).toEqual({ type: 'url', expected: '/thanks' })
  })

  it('leaves a recording alone when the user already asserted something', () => {
    const steps: IRStep[] = [
      click('a', '/cart'),
      { id: 'x', action: 'assert', element: button, assertionDetail: { type: 'visible' } },
    ]
    expect(appendFinalStateAssertion(steps)).toEqual(steps)
  })

  it('has nothing to assert when no step knows its route', () => {
    const steps: IRStep[] = [click('a'), click('b', 'about:blank')]
    expect(appendFinalStateAssertion(steps)).toEqual(steps)
  })

  it('does not mutate its input', () => {
    const steps = [click('a', '/cart')]
    appendFinalStateAssertion(steps)
    expect(steps).toHaveLength(1)
  })
})
