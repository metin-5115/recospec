import { Profiler } from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup, screen } from '@testing-library/react'
import { PopupApp } from './PopupApp'
import { useSessionStore } from '../side-panel/sessionStore'
import {
  broadcast,
  makeSession,
  makeStep,
  resetUiHarness,
} from '../side-panel/hooks/ui-message-harness.test-util'

beforeEach(resetUiHarness)
afterEach(cleanup)

describe('PopupApp', () => {
  it('shows the recording state broadcast by the background', () => {
    render(<PopupApp />)
    expect(screen.getByText('IDLE')).toBeTruthy()
    broadcast({ type: 'SESSION_STATE_CHANGED', session: makeSession('recording') })
    expect(screen.getByText('REC')).toBeTruthy()
    broadcast({ type: 'SESSION_STATE_CHANGED', session: makeSession('paused') })
    expect(screen.getByText('PAUSE')).toBeTruthy()
  })

  it('does not re-render for store changes it does not display', () => {
    let commits = 0
    render(
      <Profiler id="popup" onRender={() => (commits += 1)}>
        <PopupApp />
      </Profiler>,
    )
    broadcast({ type: 'SESSION_STATE_CHANGED', session: makeSession('recording') })
    const before = commits

    broadcast({ type: 'STEP_RECORDED', sessionId: 's1', step: makeStep('a1') })
    act(() => useSessionStore.getState().setActiveTab('history'))
    act(() => useSessionStore.getState().setIncludeMocks(true))

    expect(commits).toBe(before)
  })
})
