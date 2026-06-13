import { describe, it, expect } from 'vitest'
import { diffSessions, summarizeDiff } from './session-differ'
import type { RecordedAction } from '@shared/types/action'
import type { ScoredLocator } from '@shared/types/locator'

function loc(strategy: ScoredLocator['strategy'], selector: string): ScoredLocator {
  return { strategy, selector, framework: {}, score: 80, matchCount: 1 }
}

function step(
  sessionId: string,
  sequenceNumber: number,
  type: RecordedAction['type'],
  selector: string,
  payload?: Record<string, unknown>,
  strategy: ScoredLocator['strategy'] = 'css',
): RecordedAction {
  return {
    actionId: `${sessionId}-${sequenceNumber}`,
    sessionId,
    sequenceNumber,
    type,
    timestamp: 0,
    pageUrl: 'https://example.com',
    target: {
      primaryLocator: loc(strategy, selector),
      fallbackLocators: [],
      elementSnapshot: { tagName: 'div', attributes: {}, textContent: '' },
    },
    payload,
  }
}

describe('diffSessions', () => {
  it('reports zero changes for two identical sessions', () => {
    const a = [step('a', 0, 'click', '#one'), step('a', 1, 'fill', '#two', { value: 'x' })]
    const b = [step('b', 0, 'click', '#one'), step('b', 1, 'fill', '#two', { value: 'x' })]
    const diff = diffSessions(a, b)
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.changed).toEqual([])
    expect(diff.pairs.length).toBe(2)
    expect(summarizeDiff(diff)).toEqual({ added: 0, removed: 0, changed: 0, unchanged: 2 })
  })

  it('flags added-only steps', () => {
    const a = [step('a', 0, 'click', '#one')]
    const b = [step('b', 0, 'click', '#one'), step('b', 1, 'fill', '#two', { value: 'foo' })]
    const diff = diffSessions(a, b)
    expect(diff.added).toHaveLength(1)
    expect(diff.removed).toEqual([])
    expect(diff.changed).toEqual([])
    expect(diff.added[0].sequenceNumber).toBe(1)
  })

  it('flags removed-only steps', () => {
    const a = [step('a', 0, 'click', '#one'), step('a', 1, 'fill', '#two', { value: 'foo' })]
    const b = [step('b', 0, 'click', '#one')]
    const diff = diffSessions(a, b)
    expect(diff.removed).toHaveLength(1)
    expect(diff.added).toEqual([])
    expect(diff.removed[0].type).toBe('fill')
  })

  it('flags locator-only change in a paired step', () => {
    const a = [step('a', 0, 'click', '#login-old')]
    const b = [step('b', 0, 'click', '#login-new')]
    const diff = diffSessions(a, b)
    expect(diff.changed).toHaveLength(1)
    expect(diff.changed[0].locatorChanged).toBe(true)
    expect(diff.changed[0].valueChanged).toBe(false)
  })

  it('flags value-only change in a paired step', () => {
    const a = [step('a', 0, 'fill', '#email', { value: 'a@a' })]
    const b = [step('b', 0, 'fill', '#email', { value: 'b@b' })]
    const diff = diffSessions(a, b)
    expect(diff.changed).toHaveLength(1)
    expect(diff.changed[0].locatorChanged).toBe(false)
    expect(diff.changed[0].valueChanged).toBe(true)
  })

  it('handles a mixed add + remove + locator-change run', () => {
    const a = [
      step('a', 0, 'click', '#login'),
      step('a', 1, 'fill', '#email', { value: 'a@a' }),
      step('a', 2, 'click', '#submit-old'),
    ]
    const b = [
      step('b', 0, 'click', '#login'),
      step('b', 1, 'fill', '#email', { value: 'a@a' }),
      step('b', 2, 'click', '#submit-new'),
      step('b', 3, 'click', '#welcome'),
    ]
    const diff = diffSessions(a, b)
    expect(diff.changed).toHaveLength(1)
    expect(diff.changed[0].locatorChanged).toBe(true)
    expect(diff.added).toHaveLength(1)
    expect(diff.added[0].sequenceNumber).toBe(3)
    expect(diff.removed).toEqual([])
  })

  it('pairs by actionId when both sessions share one (e.g. duplicate row)', () => {
    const shared = step('shared', 0, 'click', '#cta')
    const a = [shared, step('a', 1, 'fill', '#x', { value: '1' })]
    const b = [step('b', 0, 'fill', '#y', { value: '2' }), shared]
    const diff = diffSessions(a, b)
    const idPair = diff.pairs.find(([i, j]) => a[i].actionId === b[j].actionId)
    expect(idPair).toBeDefined()
  })
})
