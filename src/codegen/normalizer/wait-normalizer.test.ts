import { describe, it, expect } from 'vitest'
import { normalizeActions } from './action-normalizer'
import { normalizeWaitAction } from './wait-normalizer'
import type { RecordedAction } from '@shared/types/action'
import type { ScoredLocator } from '@shared/types/locator'
import type { IRElement } from '../ir/types'

const cssLocator: ScoredLocator = {
  strategy: 'css',
  selector: '.spinner',
  framework: { playwright: '.spinner', cypress: '.spinner', seleniumPy: '.spinner' },
  score: 60,
  matchCount: 1,
}

function action(partial: Partial<RecordedAction>): RecordedAction {
  return {
    actionId: partial.actionId ?? 'a1',
    sessionId: 's1',
    sequenceNumber: partial.sequenceNumber ?? 0,
    type: partial.type ?? 'wait',
    timestamp: 1,
    pageUrl: 'https://example.com/',
    payload: partial.payload,
    target: partial.target,
    elementSnapshot: partial.elementSnapshot,
    annotation: partial.annotation,
  }
}

describe('normalizeWaitAction', () => {
  it('returns null for non-wait actions', () => {
    const result = normalizeWaitAction(action({ type: 'click' }), () => ({}) as IRElement)
    expect(result).toBeNull()
  })

  it('returns null when wait payload is missing', () => {
    const result = normalizeWaitAction(
      action({ type: 'wait', payload: {} }),
      () => ({}) as IRElement,
    )
    expect(result).toBeNull()
  })

  it('returns null when reason is invalid', () => {
    const result = normalizeWaitAction(
      action({ type: 'wait', payload: { wait: { reason: 'bogus', timeoutMs: 1000 } } }),
      () => ({}) as IRElement,
    )
    expect(result).toBeNull()
  })

  it('builds a networkidle wait without an element', () => {
    const result = normalizeWaitAction(
      action({
        type: 'wait',
        payload: { wait: { reason: 'networkidle', timeoutMs: 5000 } },
      }),
      () => ({}) as IRElement,
    )
    expect(result).toMatchObject({
      action: 'wait',
      wait: { reason: 'networkidle', timeoutMs: 5000 },
      element: undefined,
    })
  })

  it('builds a spinner wait with an element from the target', () => {
    const built: IRElement = {
      name: 'spinner',
      locatorStrategy: 'css',
      locatorValue: '.spinner',
      tagName: 'div',
    }
    const result = normalizeWaitAction(
      action({
        type: 'wait',
        payload: { wait: { reason: 'spinner', timeoutMs: 8000 } },
        target: {
          primaryLocator: cssLocator,
          fallbackLocators: [],
          elementSnapshot: { tagName: 'div', attributes: { class: 'spinner' }, textContent: '' },
        },
      }),
      () => built,
    )
    expect(result?.element).toBe(built)
    expect(result?.wait?.reason).toBe('spinner')
  })

  it('falls back to default timeout when payload value is invalid', () => {
    const result = normalizeWaitAction(
      action({
        type: 'wait',
        payload: { wait: { reason: 'networkidle', timeoutMs: -1 } },
      }),
      () => ({}) as IRElement,
    )
    expect(result?.wait?.timeoutMs).toBe(10_000)
  })
})

describe('normalizeActions — wait integration', () => {
  it('emits an IR wait step after a click', () => {
    const clickAction = action({
      actionId: 'click-1',
      sequenceNumber: 0,
      type: 'click',
      target: {
        primaryLocator: {
          strategy: 'role-name',
          selector: `'button', { name: 'Save' }`,
          framework: {},
          score: 90,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: { tagName: 'button', attributes: {}, textContent: 'Save' },
      },
    })
    const waitAction = action({
      actionId: 'wait-1',
      sequenceNumber: 1,
      type: 'wait',
      payload: { wait: { reason: 'networkidle', timeoutMs: 8000 } },
    })

    const { flatSteps } = normalizeActions([clickAction, waitAction])
    expect(flatSteps.map((s) => s.action)).toEqual(['click', 'wait'])
    expect(flatSteps[1]).toMatchObject({
      action: 'wait',
      wait: { reason: 'networkidle', timeoutMs: 8000 },
    })
  })

  it('drops malformed wait actions silently', () => {
    const waitAction = action({
      actionId: 'wait-1',
      sequenceNumber: 0,
      type: 'wait',
      payload: { wait: { reason: 'nonsense', timeoutMs: 1000 } },
    })
    const { flatSteps } = normalizeActions([waitAction])
    expect(flatSteps).toEqual([])
  })
})
