import { describe, it, expect } from 'vitest'
import { classifyBundle, classifyStep, scoreTier } from './locator-quality'
import { LOCATOR_WEAK_SCORE_THRESHOLD } from './constants'
import type { LocatorBundle, ScoredLocator } from './types/locator'
import type { RecordedAction } from './types/action'

function scored(score: number): ScoredLocator {
  return {
    strategy: 'css',
    selector: '.x',
    framework: {},
    score,
    matchCount: 1,
  }
}

function bundle(over: Partial<LocatorBundle> & { primary: ScoredLocator }): LocatorBundle {
  return {
    fallbacks: [],
    rejected: [],
    allCandidates: [over.primary],
    ...over,
  }
}

describe('classifyBundle', () => {
  it('flags a null bundle as none with a data-testid hint', () => {
    const q = classifyBundle(null)
    expect(q.level).toBe('none')
    expect(q.hint).toMatch(/data-testid/i)
  })

  it('flags a low score as weak and includes the score in the hint', () => {
    const q = classifyBundle(bundle({ primary: scored(30) }))
    expect(q.level).toBe('weak')
    expect(q.score).toBe(30)
    expect(q.hint).toMatch(/30/)
  })

  it('treats a high score as ok with a null hint', () => {
    const q = classifyBundle(bundle({ primary: scored(90) }))
    expect(q.level).toBe('ok')
    expect(q.hint).toBeNull()
  })

  it('flags closed shadow DOM with the stronger "unreliable" hint', () => {
    const q = classifyBundle(bundle({ primary: scored(90), shadowClosed: true }))
    expect(q.level).toBe('shadow')
    expect(q.hint).toMatch(/closed/i)
  })

  it('flags open shadow DOM', () => {
    const q = classifyBundle(bundle({ primary: scored(90), shadowContext: { hostChain: ['x'] } }))
    expect(q.level).toBe('shadow')
  })

  it('flags an iframe', () => {
    const q = classifyBundle(bundle({ primary: scored(90), frameContext: { frameChain: ['f'] } }))
    expect(q.level).toBe('frame')
  })

  it('lets a structural reason (frame) win over a low score', () => {
    const q = classifyBundle(bundle({ primary: scored(10), frameContext: { frameChain: ['f'] } }))
    expect(q.level).toBe('frame')
  })

  it('treats the threshold as the ok boundary (50 ok, 49 weak)', () => {
    expect(classifyBundle(bundle({ primary: scored(LOCATOR_WEAK_SCORE_THRESHOLD) })).level).toBe(
      'ok',
    )
    expect(
      classifyBundle(bundle({ primary: scored(LOCATOR_WEAK_SCORE_THRESHOLD - 1) })).level,
    ).toBe('weak')
  })
})

function step(over: Partial<RecordedAction>): RecordedAction {
  return {
    actionId: 'a',
    sessionId: 's',
    sequenceNumber: 0,
    type: 'click',
    timestamp: 0,
    pageUrl: 'https://x',
    ...over,
  }
}

describe('classifyStep', () => {
  it('never flags non-locator steps (network / wait / navigate)', () => {
    expect(classifyStep(step({ type: 'network' })).level).toBe('ok')
    expect(classifyStep(step({ type: 'wait' })).level).toBe('ok')
    expect(classifyStep(step({ type: 'navigate' })).level).toBe('ok')
  })

  it('does not flag a page-level assertion (no target)', () => {
    expect(classifyStep(step({ type: 'assert' })).level).toBe('ok')
  })

  it('flags an element-scoped weak step', () => {
    const q = classifyStep(
      step({
        target: {
          primaryLocator: scored(20),
          fallbackLocators: [],
          elementSnapshot: { tagName: 'button', attributes: {}, textContent: 'Go' },
        },
      }),
    )
    expect(q.level).toBe('weak')
  })

  it('prefers the persisted quality on the target when present', () => {
    const q = classifyStep(
      step({
        target: {
          primaryLocator: scored(90),
          fallbackLocators: [],
          elementSnapshot: { tagName: 'button', attributes: {}, textContent: 'Go' },
          frameContext: { frameChain: ['f'] },
        },
      }),
    )
    // Re-derived from the target fields → frame.
    expect(q.level).toBe('frame')
  })

  it('flags a targeted element with no locator as none', () => {
    const q = classifyStep(
      step({
        elementSnapshot: { tagName: 'div', attributes: {}, textContent: '' },
      }),
    )
    expect(q.level).toBe('none')
  })
})

describe('scoreTier', () => {
  it('aligns the Medium/Weak boundary with the weak threshold', () => {
    expect(scoreTier(LOCATOR_WEAK_SCORE_THRESHOLD).label).toBe('Medium')
    expect(scoreTier(LOCATOR_WEAK_SCORE_THRESHOLD - 1).label).toBe('Weak')
    expect(scoreTier(80).label).toBe('Strong')
  })
})
