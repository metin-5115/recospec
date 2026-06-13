import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore } from './sessionStore'
import type { RecordedAction } from '@shared/types/action'
import type { ScoredLocator } from '@shared/types/locator'

function makeStep(actionId: string, sequenceNumber: number): RecordedAction {
  return {
    actionId,
    sessionId: 'sess-1',
    sequenceNumber,
    type: 'click',
    timestamp: Date.now(),
    pageUrl: 'https://example.com',
  }
}

function makeLocator(
  strategy: ScoredLocator['strategy'],
  selector: string,
  score: number,
): ScoredLocator {
  return { strategy, selector, framework: {}, score, matchCount: 1 }
}

beforeEach(() => {
  useSessionStore.setState({
    activeSession: null,
    steps: [],
    generatedCode: null,
    codeGenError: null,
    stepsDirty: false,
    sessions: [],
  })
})

describe('sessionStore: reorderSteps', () => {
  it('moves the step from→to and recomputes sequenceNumbers', () => {
    useSessionStore.setState({
      steps: [makeStep('a', 0), makeStep('b', 1), makeStep('c', 2)],
    })
    const ids = useSessionStore.getState().reorderSteps(0, 2)
    expect(ids).toEqual(['b', 'c', 'a'])
    const steps = useSessionStore.getState().steps
    expect(steps.map((s) => s.actionId)).toEqual(['b', 'c', 'a'])
    expect(steps.map((s) => s.sequenceNumber)).toEqual([0, 1, 2])
    expect(useSessionStore.getState().stepsDirty).toBe(true)
  })

  it('returns the existing order untouched on a no-op', () => {
    useSessionStore.setState({
      steps: [makeStep('a', 0), makeStep('b', 1)],
    })
    const ids = useSessionStore.getState().reorderSteps(0, 0)
    expect(ids).toEqual(['a', 'b'])
    expect(useSessionStore.getState().stepsDirty).toBe(false)
  })

  it('returns existing order on out-of-bounds without mutating state', () => {
    useSessionStore.setState({
      steps: [makeStep('a', 0), makeStep('b', 1)],
    })
    const ids = useSessionStore.getState().reorderSteps(0, 9)
    expect(ids).toEqual(['a', 'b'])
    expect(useSessionStore.getState().stepsDirty).toBe(false)
  })
})

describe('sessionStore: updateStep', () => {
  it('partial-merges the patch and flips stepsDirty', () => {
    const step = makeStep('a', 0)
    step.type = 'fill'
    step.payload = { value: 'old' }
    useSessionStore.setState({ steps: [step] })

    useSessionStore.getState().updateStep('a', { payload: { value: 'new', delay: 100 } })

    const updated = useSessionStore.getState().steps[0]
    expect(updated.payload).toEqual({ value: 'new', delay: 100 })
    expect(useSessionStore.getState().stepsDirty).toBe(true)
  })

  it('is a no-op for unknown actionId', () => {
    const step = makeStep('a', 0)
    useSessionStore.setState({ steps: [step] })
    useSessionStore.getState().updateStep('does-not-exist', { payload: { value: 'x' } })
    expect(useSessionStore.getState().stepsDirty).toBe(false)
  })
})

describe('sessionStore: setStepLocator', () => {
  it('promotes the chosen candidate to primary and demotes the previous primary into fallbacks', () => {
    const step = makeStep('a', 0)
    const oldPrimary = makeLocator('css', '#submit', 60)
    const candidateA = makeLocator('aria-label', '[aria-label="Go"]', 80)
    step.target = {
      primaryLocator: oldPrimary,
      fallbackLocators: [candidateA],
      allCandidates: [oldPrimary, candidateA],
      elementSnapshot: { tagName: 'button', attributes: {}, textContent: 'Go' },
    }
    useSessionStore.setState({ steps: [step] })

    const patch = useSessionStore.getState().setStepLocator('a', candidateA)
    expect(patch).not.toBeNull()
    expect(patch?.target?.primaryLocator.strategy).toBe('aria-label')
    expect(patch?.target?.userOverridden).toBe(true)

    const updated = useSessionStore.getState().steps[0]
    expect(updated.target?.primaryLocator.strategy).toBe('aria-label')
    expect(updated.target?.userOverridden).toBe(true)
    // Old primary should now appear in fallbacks
    expect(updated.target?.fallbackLocators.some((f) => f.strategy === 'css')).toBe(true)
    expect(useSessionStore.getState().stepsDirty).toBe(true)
  })

  it('returns null when picking the same locator that is already primary', () => {
    const step = makeStep('a', 0)
    const primary = makeLocator('testid', 'submit', 95)
    step.target = {
      primaryLocator: primary,
      fallbackLocators: [],
      allCandidates: [primary],
      elementSnapshot: { tagName: 'button', attributes: {}, textContent: '' },
    }
    useSessionStore.setState({ steps: [step] })

    const patch = useSessionStore.getState().setStepLocator('a', primary)
    expect(patch).toBeNull()
    expect(useSessionStore.getState().stepsDirty).toBe(false)
  })
})

describe('sessionStore: dirty flag lifecycle', () => {
  it('clears stepsDirty when generated code is set', () => {
    const step = makeStep('a', 0)
    useSessionStore.setState({ steps: [step], stepsDirty: true })
    useSessionStore.getState().setGeneratedCode({
      framework: 'playwright-ts',
      files: [],
    })
    expect(useSessionStore.getState().stepsDirty).toBe(false)
  })

  it('preserves stepsDirty when syncing steps after a user edit', () => {
    const step = makeStep('a', 0)
    useSessionStore.setState({ steps: [step], stepsDirty: true })
    useSessionStore.getState().syncSteps([{ ...step, sequenceNumber: 1 }])
    expect(useSessionStore.getState().stepsDirty).toBe(true)
  })

  it('clears stepsDirty when steps are cleared (e.g. loading a different session)', () => {
    useSessionStore.setState({ steps: [makeStep('a', 0)], stepsDirty: true })
    useSessionStore.getState().clearSteps()
    expect(useSessionStore.getState().stepsDirty).toBe(false)
    expect(useSessionStore.getState().steps).toHaveLength(0)
  })
})

describe('sessionStore: persisted preferences', () => {
  beforeEach(() => {
    try {
      window.localStorage.clear()
    } catch {
      /* ignore */
    }
  })

  it('persists includeMocks to localStorage and updates state', () => {
    useSessionStore.getState().setIncludeMocks(true)
    expect(useSessionStore.getState().includeMocks).toBe(true)
    expect(window.localStorage.getItem('recospec.includeMocks')).toBe('true')
    useSessionStore.getState().setIncludeMocks(false)
    expect(window.localStorage.getItem('recospec.includeMocks')).toBe('false')
  })

  it('round-trips outputSelection as JSON', () => {
    const selection = { pageObjects: true, test: false, scaffold: false }
    useSessionStore.getState().setOutputSelection(selection)
    expect(useSessionStore.getState().outputSelection).toEqual(selection)
    expect(JSON.parse(window.localStorage.getItem('recospec.outputSelection')!)).toEqual(selection)
  })

  it('does not throw when localStorage writes fail', () => {
    const original = window.localStorage.setItem
    window.localStorage.setItem = () => {
      throw new Error('quota')
    }
    try {
      expect(() => useSessionStore.getState().setIncludeMocks(true)).not.toThrow()
      // State still updates even though persistence failed.
      expect(useSessionStore.getState().includeMocks).toBe(true)
    } finally {
      window.localStorage.setItem = original
    }
  })
})
