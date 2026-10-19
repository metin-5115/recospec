import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { RecordedAction } from '@shared/types/action'

vi.mock('./locator-presentation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./locator-presentation')>()
  return { ...actual, scoreTier: vi.fn(actual.scoreTier) }
})

import { scoreTier } from './locator-presentation'
import { StepList } from './StepList'

afterEach(() => {
  cleanup()
  vi.mocked(scoreTier).mockClear()
})

function step(n: number): RecordedAction {
  return {
    actionId: `a${n}`,
    sessionId: 's1',
    sequenceNumber: n,
    type: 'click',
    timestamp: n,
    pageUrl: 'https://example.com',
    target: {
      primaryLocator: {
        strategy: 'testid',
        selector: `[data-testid="b${n}"]`,
        framework: {},
        score: 90,
        matchCount: 1,
      },
      fallbackLocators: [],
      elementSnapshot: { tagName: 'button', attributes: {}, textContent: `B${n}` },
    },
  }
}

describe('StepList — rows are memoized', () => {
  const onDelete = vi.fn()
  const onUpdate = vi.fn()
  const onPick = vi.fn()
  const onReorder = vi.fn()
  const onAddAssertion = vi.fn()

  function list(steps: RecordedAction[], flashStepId: string | null = null) {
    return (
      <StepList
        steps={steps}
        reorderable={false}
        flashStepId={flashStepId}
        onDeleteStep={onDelete}
        onReorderStep={onReorder}
        onUpdateStep={onUpdate}
        onPickLocator={onPick}
        onAddAssertion={onAddAssertion}
      />
    )
  }

  it('renders only the new row when a step is appended', () => {
    const initial = [step(0), step(1), step(2)]
    const { rerender } = render(list(initial))
    const renderedInitially = vi.mocked(scoreTier).mock.calls.length
    expect(renderedInitially).toBe(3)

    rerender(list([...initial, step(3)]))

    expect(vi.mocked(scoreTier).mock.calls.length - renderedInitially).toBe(1)
  })

  it('re-renders only the rows whose own state changed (the flashing one)', () => {
    const steps = [step(0), step(1), step(2)]
    const { rerender } = render(list(steps))
    vi.mocked(scoreTier).mockClear()

    rerender(list(steps, 'a1'))

    expect(vi.mocked(scoreTier).mock.calls.length).toBe(1)
  })
})
