import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { StepEditModal } from './StepEditModal'
import type { RecordedAction } from '@shared/types/action'
import type { ScoredLocator } from '@shared/types/locator'

afterEach(cleanup)

function makeLocator(
  strategy: ScoredLocator['strategy'],
  selector: string,
  score: number,
): ScoredLocator {
  return { strategy, selector, framework: {}, score, matchCount: 1 }
}

function makeStep(overrides: Partial<RecordedAction> = {}): RecordedAction {
  return {
    actionId: 'a1',
    sessionId: 's1',
    sequenceNumber: 0,
    type: 'fill',
    timestamp: 0,
    pageUrl: 'https://example.com',
    payload: { value: 'hello' },
    target: {
      primaryLocator: makeLocator('css', '#name', 60),
      fallbackLocators: [makeLocator('aria-label', '[aria-label="Name"]', 80)],
      allCandidates: [
        makeLocator('css', '#name', 60),
        makeLocator('aria-label', '[aria-label="Name"]', 80),
        makeLocator('id', 'name', 70),
      ],
      elementSnapshot: { tagName: 'input', attributes: {}, textContent: '' },
    },
    ...overrides,
  }
}

describe('StepEditModal', () => {
  it('renders the dialog with the step type and a Fields tab by default', () => {
    render(
      <StepEditModal
        step={makeStep()}
        onCancel={vi.fn()}
        onApply={vi.fn()}
        onPickLocator={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Edit step' })).toBeTruthy()
    expect(screen.getByLabelText('Step value')).toBeTruthy()
  })

  it('emits the patched payload on Apply (fill value)', () => {
    const onApply = vi.fn()
    render(
      <StepEditModal
        step={makeStep()}
        onCancel={vi.fn()}
        onApply={onApply}
        onPickLocator={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Step value'), { target: { value: 'newval' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply.mock.calls[0][0]).toEqual({ payload: { value: 'newval' } })
  })

  it('strips delay=0 from the patched payload', () => {
    const onApply = vi.fn()
    render(
      <StepEditModal
        step={makeStep()}
        onCancel={vi.fn()}
        onApply={onApply}
        onPickLocator={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    expect(onApply.mock.calls[0][0].payload).not.toHaveProperty('delay')
  })

  it('preserves a positive delay in the patched payload', () => {
    const onApply = vi.fn()
    render(
      <StepEditModal
        step={makeStep()}
        onCancel={vi.fn()}
        onApply={onApply}
        onPickLocator={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Step delay'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    expect(onApply.mock.calls[0][0].payload.delay).toBe(500)
  })

  it('lists every candidate on the Locator tab and emits onPickLocator with the chosen one', () => {
    const onPick = vi.fn()
    render(
      <StepEditModal
        step={makeStep()}
        onCancel={vi.fn()}
        onApply={vi.fn()}
        onPickLocator={onPick}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Locator/i }))
    // current primary shows "Current" pill
    expect(screen.getByText('Current')).toBeTruthy()
    // pick the aria-label fallback
    const useButtons = screen.getAllByRole('button', { name: 'Use this' })
    fireEvent.click(useButtons[0])
    expect(onPick).toHaveBeenCalledTimes(1)
    expect((onPick.mock.calls[0][0] as ScoredLocator).strategy).toBe('aria-label')
  })

  it('hides the Locator tab for network steps', () => {
    const networkStep = makeStep({
      type: 'network',
      target: undefined,
      payload: { method: 'GET', url: 'https://api.test/x' },
    })
    render(
      <StepEditModal
        step={networkStep}
        onCancel={vi.fn()}
        onApply={vi.fn()}
        onPickLocator={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /Locator/i })).toBeNull()
  })

  it('Escape key calls onCancel', () => {
    const onCancel = vi.fn()
    render(
      <StepEditModal
        step={makeStep()}
        onCancel={onCancel}
        onApply={vi.fn()}
        onPickLocator={vi.fn()}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
