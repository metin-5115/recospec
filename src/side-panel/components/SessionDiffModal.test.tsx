import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

import { SessionDiffModal } from './SessionDiffModal'
import type { RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'
import type { ScoredLocator } from '@shared/types/locator'

function loc(strategy: ScoredLocator['strategy'], selector: string): ScoredLocator {
  return { strategy, selector, framework: {}, score: 80, matchCount: 1 }
}

function makeSession(overrides: Partial<Session>): Session {
  return {
    sessionId: 'sess',
    name: 'Login Flow',
    state: 'stopped',
    startUrl: 'https://example.com',
    startedAt: 0,
    metadata: { userAgent: 'x', viewport: { width: 0, height: 0 }, timezone: 'UTC' },
    config: { captureClicks: true, captureInputs: true, captureNavigation: true },
    iterationNumber: 1,
    flowSignature: 'sig',
    ...overrides,
  }
}

function step(
  sessionId: string,
  sequenceNumber: number,
  type: RecordedAction['type'],
  selector: string,
  payload?: Record<string, unknown>,
): RecordedAction {
  return {
    actionId: `${sessionId}-${sequenceNumber}`,
    sessionId,
    sequenceNumber,
    type,
    timestamp: 0,
    pageUrl: 'https://example.com',
    target: {
      primaryLocator: loc('css', selector),
      fallbackLocators: [],
      elementSnapshot: { tagName: 'button', attributes: {}, textContent: '' },
    },
    payload,
  }
}

describe('SessionDiffModal', () => {
  beforeEach(() => {
    // jsdom doesn't implement these — stub them so the JSON-export path can run.
    if (!('createObjectURL' in URL)) {
      ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:fake'
    }
    if (!('revokeObjectURL' in URL)) {
      ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {}
    }
  })

  it('renders header summary with both session names and step counts', () => {
    const a = makeSession({ sessionId: 'a', name: 'Login Flow', iterationNumber: 1 })
    const b = makeSession({ sessionId: 'b', name: 'Login Flow v2', iterationNumber: 2 })
    render(
      <SessionDiffModal
        sessionA={a}
        actionsA={[step('a', 0, 'click', '#login')]}
        sessionB={b}
        actionsB={[
          step('b', 0, 'click', '#login'),
          step('b', 1, 'fill', '#email', { value: 'foo' }),
        ]}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/Login Flow/)).toBeTruthy()
    expect(screen.getByText(/Login Flow v2/)).toBeTruthy()
    expect(screen.getByText('(1 steps)')).toBeTruthy()
    expect(screen.getByText('(2 steps)')).toBeTruthy()
    expect(screen.getByText('+1')).toBeTruthy()
  })

  it('renders an added row with the success tone tag', () => {
    const a = makeSession({ sessionId: 'a' })
    const b = makeSession({ sessionId: 'b' })
    render(
      <SessionDiffModal
        sessionA={a}
        actionsA={[step('a', 0, 'click', '#login')]}
        sessionB={b}
        actionsB={[step('b', 0, 'click', '#login'), step('b', 1, 'click', '#new')]}
        onClose={vi.fn()}
      />,
    )
    const addedRows = screen.getAllByTestId('diff-row-added')
    expect(addedRows.length).toBeGreaterThan(0)
  })

  it('renders a changed row when only the locator differs', () => {
    const a = makeSession({ sessionId: 'a' })
    const b = makeSession({ sessionId: 'b' })
    render(
      <SessionDiffModal
        sessionA={a}
        actionsA={[step('a', 0, 'click', '#login-old')]}
        sessionB={b}
        actionsB={[step('b', 0, 'click', '#login-new')]}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('diff-row-pair-changed')).toBeTruthy()
  })

  it('renders the no-changes hint when the two sessions are identical', () => {
    const a = makeSession({ sessionId: 'a' })
    const b = makeSession({ sessionId: 'b' })
    render(
      <SessionDiffModal sessionA={a} actionsA={[]} sessionB={b} actionsB={[]} onClose={vi.fn()} />,
    )
    expect(screen.getByText(/step-for-step identical/i)).toBeTruthy()
  })

  it('fires onClose when the user clicks the close button', () => {
    const onClose = vi.fn()
    const a = makeSession({ sessionId: 'a' })
    const b = makeSession({ sessionId: 'b' })
    render(
      <SessionDiffModal
        sessionA={a}
        actionsA={[step('a', 0, 'click', '#x')]}
        sessionB={b}
        actionsB={[step('b', 0, 'click', '#x')]}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByLabelText(/Close diff/i))
    expect(onClose).toHaveBeenCalled()
  })

  it('Export diff as JSON triggers a download (URL.createObjectURL called)', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    const a = makeSession({ sessionId: 'aaaa-aaaa', name: 'A' })
    const b = makeSession({ sessionId: 'bbbb-bbbb', name: 'B' })
    render(
      <SessionDiffModal
        sessionA={a}
        actionsA={[step('a', 0, 'click', '#login')]}
        sessionB={b}
        actionsB={[step('b', 0, 'click', '#login')]}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText(/Export diff as JSON/i))
    expect(createSpy).toHaveBeenCalled()
    createSpy.mockRestore()
  })
})
