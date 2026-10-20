import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useSessionStore } from '../sessionStore'
import { useReplay } from './useReplay'
import { broadcast, makeSession, makeStep, resetUiHarness } from './ui-message-harness.test-util'

vi.mock('@storage/session-repo', () => ({ listSessions: vi.fn(async () => []) }))
vi.mock('@storage/action-repo', () => ({ getActionsBySession: vi.fn(async () => []) }))

function sent(): Array<{ type: string }> {
  const fn = (
    globalThis as unknown as { chrome: { runtime: { sendMessage: ReturnType<typeof vi.fn> } } }
  ).chrome.runtime.sendMessage
  return fn.mock.calls.map((c) => c[0] as { type: string })
}

beforeEach(() => {
  resetUiHarness()
  useSessionStore.setState({
    activeSession: makeSession('stopped'),
    steps: [makeStep('a'), makeStep('b')],
  })
})

afterEach(cleanup)

describe('useReplay', () => {
  it('starts a replay: marks it running and asks the background', async () => {
    const { result } = renderHook(() => useReplay())
    await act(async () => {
      await result.current.replayCurrentSession()
    })
    expect(result.current.replayState).toMatchObject({ running: true, totalSteps: 2 })
    expect(sent().map((m) => m.type)).toEqual(['REPLAY_REQUEST'])
  })

  it('does not replay without steps or while already running', async () => {
    useSessionStore.setState({ steps: [] })
    const { result } = renderHook(() => useReplay())
    await act(async () => {
      await result.current.replayCurrentSession()
    })
    expect(sent()).toEqual([])

    useSessionStore.setState({ steps: [makeStep('a')] })
    await act(async () => {
      await result.current.replayCurrentSession()
    })
    await act(async () => {
      await result.current.replayCurrentSession()
    })
    expect(sent().filter((m) => m.type === 'REPLAY_REQUEST')).toHaveLength(1)
  })

  it('tallies step results and finishes on REPLAY_DONE', () => {
    const { result } = renderHook(() => useReplay())
    broadcast({ type: 'REPLAY_STARTED', sessionId: 's1', totalSteps: 3 })
    broadcast({ type: 'REPLAY_STEP_STARTED', sessionId: 's1', actionId: 'a', index: 0 })
    expect(result.current.replayState.currentActionId).toBe('a')
    expect(result.current.replayState.results.a).toBe('running')

    broadcast({
      type: 'REPLAY_STEP_RESULT',
      sessionId: 's1',
      actionId: 'a',
      index: 0,
      status: 'pass',
    })
    broadcast({
      type: 'REPLAY_STEP_RESULT',
      sessionId: 's1',
      actionId: 'b',
      index: 1,
      status: 'fail',
    })
    broadcast({
      type: 'REPLAY_STEP_RESULT',
      sessionId: 's1',
      actionId: 'c',
      index: 2,
      status: 'skipped',
    })
    broadcast({
      type: 'REPLAY_DONE',
      sessionId: 's1',
      totalSteps: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
      aborted: true,
      error: 'stopped',
    })

    expect(result.current.replayState).toMatchObject({
      running: false,
      currentActionId: null,
      passed: 1,
      failed: 1,
      skipped: 1,
      aborted: true,
      error: 'stopped',
    })
  })

  it('only sends an abort while a replay is running', async () => {
    const { result } = renderHook(() => useReplay())
    await act(async () => {
      await result.current.abortReplay()
    })
    expect(sent()).toEqual([])

    broadcast({ type: 'REPLAY_STARTED', sessionId: 's1', totalSteps: 2 })
    await act(async () => {
      await result.current.abortReplay()
    })
    expect(sent().map((m) => m.type)).toEqual(['REPLAY_ABORT'])
  })
})
