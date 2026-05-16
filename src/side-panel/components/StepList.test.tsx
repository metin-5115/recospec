import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

import { StepList } from './StepList'
import type { RecordedAction } from '@shared/types/action'

function makeStep(overrides: Partial<RecordedAction>): RecordedAction {
  return {
    actionId: 'a1',
    sessionId: 's1',
    sequenceNumber: 0,
    type: 'click',
    timestamp: 0,
    pageUrl: 'https://example.com',
    ...overrides,
  }
}

describe('StepList — rich locator cell', () => {
  it('renders selector with score pill and strategy badge for high-score primary', () => {
    const step = makeStep({
      target: {
        primaryLocator: {
          strategy: 'testid',
          selector: '[data-testid="submit"]',
          framework: {},
          score: 95,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: { tagName: 'button', attributes: {}, textContent: 'Submit' },
      },
    })
    render(<StepList steps={[step]} reorderable={false} onDeleteStep={vi.fn()} />)
    expect(screen.getByText('[data-testid="submit"]')).toBeTruthy()
    expect(screen.getByText('95')).toBeTruthy()
    expect(screen.getByText('testid')).toBeTruthy()
    expect(screen.getByText(/button.*"Submit"/)).toBeTruthy()
  })

  it('opens locator detail popover with all-strategies table on click', () => {
    const step = makeStep({
      target: {
        primaryLocator: {
          strategy: 'testid',
          selector: 'submit-btn',
          framework: {},
          score: 95,
          matchCount: 1,
        },
        fallbackLocators: [
          {
            strategy: 'aria-label',
            selector: '[aria-label="Submit"]',
            framework: {},
            score: 80,
            matchCount: 1,
          },
        ],
        elementSnapshot: { tagName: 'button', attributes: {}, textContent: 'Submit' },
      },
    })
    render(<StepList steps={[step]} reorderable={false} onDeleteStep={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show locator detail' }))
    expect(screen.getByRole('dialog', { name: 'Locator detail' })).toBeTruthy()
    expect(screen.getByText('All strategies')).toBeTruthy()
    expect(screen.getByText('Element snapshot')).toBeTruthy()
    expect(screen.getByText('aria-label')).toBeTruthy()
  })

  it('renders frame-chain selector object as JSON, not <tag> fallback', () => {
    const step = makeStep({
      target: {
        primaryLocator: {
          strategy: 'css',
          selector: { frame: 'iframe[name="card"]', target: 'input#cc' },
          framework: {},
          score: 60,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: { tagName: 'input', attributes: {}, textContent: '' },
      },
    })
    render(<StepList steps={[step]} reorderable={false} onDeleteStep={vi.fn()} />)
    const json = JSON.stringify({ frame: 'iframe[name="card"]', target: 'input#cc' })
    expect(screen.getByText(json)).toBeTruthy()
  })

  it('renders empty state when there are no steps', () => {
    render(<StepList steps={[]} reorderable={false} onDeleteStep={vi.fn()} />)
    expect(screen.getByText('No steps yet')).toBeTruthy()
  })

  it('shows ✏ overridden pill when target.userOverridden is true', () => {
    const step = makeStep({
      target: {
        primaryLocator: {
          strategy: 'css',
          selector: '#submit',
          framework: {},
          score: 70,
          matchCount: 1,
        },
        fallbackLocators: [],
        userOverridden: true,
        elementSnapshot: { tagName: 'button', attributes: {}, textContent: 'Go' },
      },
    })
    render(<StepList steps={[step]} reorderable={false} onDeleteStep={vi.fn()} />)
    expect(screen.getByText(/overridden/)).toBeTruthy()
  })

  it('drag handle and edit button only render when reorderable=true', () => {
    const step = makeStep({
      target: {
        primaryLocator: {
          strategy: 'testid',
          selector: 'submit-btn',
          framework: {},
          score: 95,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: { tagName: 'button', attributes: {}, textContent: 'Submit' },
      },
    })
    const { rerender } = render(
      <StepList steps={[step]} reorderable={false} onDeleteStep={vi.fn()} />,
    )
    expect(screen.queryByLabelText('Drag to reorder')).toBeNull()
    expect(screen.queryByLabelText('Edit step')).toBeNull()

    rerender(<StepList steps={[step]} reorderable={true} onDeleteStep={vi.fn()} />)
    expect(screen.getByLabelText('Drag to reorder')).toBeTruthy()
    expect(screen.getByLabelText('Edit step')).toBeTruthy()
  })

  it('opens StepEditModal on edit click', () => {
    const step = makeStep({
      type: 'fill',
      payload: { value: 'hello' },
      target: {
        primaryLocator: {
          strategy: 'testid',
          selector: 'name-input',
          framework: {},
          score: 90,
          matchCount: 1,
        },
        fallbackLocators: [],
        elementSnapshot: { tagName: 'input', attributes: {}, textContent: '' },
      },
    })
    render(<StepList steps={[step]} reorderable={true} onDeleteStep={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Edit step'))
    expect(screen.getByRole('dialog', { name: 'Edit step' })).toBeTruthy()
  })
})
