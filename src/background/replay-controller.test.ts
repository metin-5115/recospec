import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { RecordedAction } from '@shared/types/action'
import { REPLAY_STEP_RESPONSE_TIMEOUT_MS } from '@shared/constants'

type Broadcast = { type: string } & Record<string, unknown>

const mocks = vi.hoisted(() => ({
  broadcastToUI: vi.fn(async (_message: unknown) => undefined),
  sendToTab: vi.fn(async (_tabId: number, _message: unknown) => undefined),
  getSession: vi.fn(async (_id: string): Promise<unknown> => undefined),
  getActionsBySession: vi.fn(async (_id: string): Promise<unknown[]> => []),
  resolveActiveTab: vi.fn(async (): Promise<{ id?: number } | null> => ({ id: 7 })),
}))

vi.mock('@shared/messaging/send', () => ({
  broadcastToUI: mocks.broadcastToUI,
  sendToTab: mocks.sendToTab,
}))
vi.mock('@storage/session-repo', () => ({ getSession: mocks.getSession }))
vi.mock('@storage/action-repo', () => ({ getActionsBySession: mocks.getActionsBySession }))
vi.mock('./active-tab', () => ({ resolveActiveTab: mocks.resolveActiveTab }))
vi.mock('@shared/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  startReplay,
  abortReplay,
  handleReplayStepResponse,
  isReplayRunning,
} from './replay-controller'

function broadcasts(type?: string): Broadcast[] {
  const all = mocks.broadcastToUI.mock.calls.map((c) => c[0] as Broadcast)
  return type ? all.filter((m) => m.type === type) : all
}

function clickAction(actionId: string, overrides: Partial<RecordedAction> = {}): RecordedAction {
  return {
    actionId,
    sessionId: 's1',
    sequenceNumber: 0,
    type: 'click',
    timestamp: 0,
    pageUrl: 'https://example.com/',
    target: {
      primaryLocator: { strategy: 'css', selector: '#go', framework: {}, score: 1, matchCount: 1 },
      fallbackLocators: [],
      allCandidates: [],
      elementSnapshot: { tagName: 'button' },
    },
    ...overrides,
  } as unknown as RecordedAction
}

/** Answer each step as soon as the controller has handed it to the page. */
function autoRespond(status: 'pass' | 'fail' | 'skipped' = 'pass', error?: string): void {
  mocks.sendToTab.mockImplementation(async (_tabId, message) => {
    const { sessionId, actionId } = message as { sessionId: string; actionId: string }
    setTimeout(() => handleReplayStepResponse(sessionId, actionId, status, error), 0)
    return undefined
  })
}

async function runToCompletion(promise: Promise<void>): Promise<void> {
  await vi.runAllTimersAsync()
  await promise
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.getSession.mockResolvedValue({ sessionId: 's1' })
  mocks.getActionsBySession.mockResolvedValue([])
  mocks.resolveActiveTab.mockResolvedValue({ id: 7 })
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    alarms: {
      clear: vi.fn(async () => true),
      create: vi.fn(async () => undefined),
      onAlarm: { hasListener: vi.fn(() => false), addListener: vi.fn() },
    },
    tabs: {
      onUpdated: {
        addListener: vi.fn((listener: (tabId: number, info: { status: string }) => void) => {
          listener(7, { status: 'complete' })
        }),
        removeListener: vi.fn(),
      },
    },
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startReplay — preconditions', () => {
  it('reports a missing session without touching the page', async () => {
    mocks.getSession.mockResolvedValue(undefined)
    await startReplay('s1')
    expect(broadcasts('REPLAY_DONE')[0]).toMatchObject({
      error: 'Session not found',
      totalSteps: 0,
    })
    expect(mocks.sendToTab).not.toHaveBeenCalled()
  })

  it('reports a session that has no recorded actions', async () => {
    await startReplay('s1')
    expect(broadcasts('REPLAY_DONE')[0]).toMatchObject({
      error: 'Session has no recorded actions',
    })
  })

  it('reports when there is no tab to replay against', async () => {
    mocks.getActionsBySession.mockResolvedValue([clickAction('a1')])
    mocks.resolveActiveTab.mockResolvedValue(null)
    await startReplay('s1')
    expect(broadcasts('REPLAY_DONE')[0]).toMatchObject({ totalSteps: 1 })
    expect(String(broadcasts('REPLAY_DONE')[0].error)).toContain('No active browser tab')
    expect(isReplayRunning()).toBe(false)
  })
})

describe('startReplay — running', () => {
  it('runs every step in order and tallies the result', async () => {
    mocks.getActionsBySession.mockResolvedValue([clickAction('a1'), clickAction('a2')])
    autoRespond('pass')

    await runToCompletion(startReplay('s1'))

    expect(broadcasts('REPLAY_STARTED')[0]).toMatchObject({ totalSteps: 2 })
    expect(broadcasts('REPLAY_STEP_RESULT').map((m) => [m.actionId, m.status])).toEqual([
      ['a1', 'pass'],
      ['a2', 'pass'],
    ])
    expect(broadcasts('REPLAY_DONE')[0]).toMatchObject({
      passed: 2,
      failed: 0,
      skipped: 0,
      aborted: false,
    })
    expect(isReplayRunning()).toBe(false)
  })

  it('counts a failing step and keeps going', async () => {
    mocks.getActionsBySession.mockResolvedValue([clickAction('a1'), clickAction('a2')])
    autoRespond('fail', 'not found')

    await runToCompletion(startReplay('s1'))

    expect(broadcasts('REPLAY_DONE')[0]).toMatchObject({ passed: 0, failed: 2 })
    expect(broadcasts('REPLAY_STEP_RESULT')[0]).toMatchObject({ error: 'not found' })
  })

  it('skips an element-less non-navigation step without messaging the page', async () => {
    mocks.getActionsBySession.mockResolvedValue([clickAction('a1', { target: undefined })])

    await runToCompletion(startReplay('s1'))

    expect(mocks.sendToTab).not.toHaveBeenCalled()
    expect(broadcasts('REPLAY_DONE')[0]).toMatchObject({ skipped: 1 })
  })

  it('fails a targeted step that has no locator', async () => {
    const action = clickAction('a1')
    ;(action.target as { primaryLocator?: unknown }).primaryLocator = undefined
    mocks.getActionsBySession.mockResolvedValue([action])

    await runToCompletion(startReplay('s1'))

    expect(mocks.sendToTab).not.toHaveBeenCalled()
    expect(broadcasts('REPLAY_STEP_RESULT')[0]).toMatchObject({
      status: 'fail',
      error: 'Step is missing a locator',
    })
  })

  it('fails the step when the page cannot be reached', async () => {
    mocks.getActionsBySession.mockResolvedValue([clickAction('a1')])
    mocks.sendToTab.mockRejectedValue(new Error('no receiver'))

    await runToCompletion(startReplay('s1'))

    const result = broadcasts('REPLAY_STEP_RESULT')[0]
    expect(result.status).toBe('fail')
    expect(String(result.error)).toContain('Could not reach the page (no receiver)')
  })

  it('fails the step when the page never answers', async () => {
    mocks.getActionsBySession.mockResolvedValue([clickAction('a1')])
    mocks.sendToTab.mockResolvedValue(undefined)

    const run = startReplay('s1')
    await vi.advanceTimersByTimeAsync(REPLAY_STEP_RESPONSE_TIMEOUT_MS + 1)
    await runToCompletion(run)

    expect(broadcasts('REPLAY_STEP_RESULT')[0]).toMatchObject({
      status: 'fail',
      error: 'Step response timed out',
    })
  })

  it('waits for the tab to finish loading after a passing navigation', async () => {
    mocks.getActionsBySession.mockResolvedValue([
      clickAction('nav', { type: 'navigate', target: undefined }),
    ])
    autoRespond('pass')

    await runToCompletion(startReplay('s1'))

    const tabs = (globalThis as unknown as { chrome: typeof chrome }).chrome.tabs
    expect(tabs.onUpdated.addListener).toHaveBeenCalledTimes(1)
    expect(broadcasts('REPLAY_DONE')[0]).toMatchObject({ passed: 1 })
  })
})

describe('abort and re-entrancy', () => {
  it('abort frees the in-flight step and stops the loop', async () => {
    mocks.getActionsBySession.mockResolvedValue([clickAction('a1'), clickAction('a2')])
    mocks.sendToTab.mockResolvedValue(undefined)

    const run = startReplay('s1')
    await vi.advanceTimersByTimeAsync(0)
    expect(isReplayRunning()).toBe(true)

    abortReplay('s1')
    await runToCompletion(run)

    expect(broadcasts('REPLAY_DONE')[0]).toMatchObject({ aborted: true, failed: 1, passed: 0 })
    expect(broadcasts('REPLAY_STEP_STARTED')).toHaveLength(1)
  })

  it('ignores an abort for a different session', async () => {
    mocks.getActionsBySession.mockResolvedValue([clickAction('a1')])
    mocks.sendToTab.mockResolvedValue(undefined)

    const run = startReplay('s1')
    await vi.advanceTimersByTimeAsync(0)
    abortReplay('other')
    autoRespond('pass')
    handleReplayStepResponse('s1', 'a1', 'pass')
    await runToCompletion(run)

    expect(broadcasts('REPLAY_DONE')[0]).toMatchObject({ aborted: false, passed: 1 })
  })

  it('refuses a second replay while one is running', async () => {
    mocks.getActionsBySession.mockResolvedValue([clickAction('a1')])
    mocks.sendToTab.mockResolvedValue(undefined)

    const first = startReplay('s1')
    await vi.advanceTimersByTimeAsync(0)
    await startReplay('s1')

    expect(broadcasts('REPLAY_STARTED')).toHaveLength(1)

    handleReplayStepResponse('s1', 'a1', 'pass')
    await runToCompletion(first)
  })

  it('ignores a step response for the wrong action id', async () => {
    mocks.getActionsBySession.mockResolvedValue([clickAction('a1')])
    mocks.sendToTab.mockResolvedValue(undefined)

    const run = startReplay('s1')
    await vi.advanceTimersByTimeAsync(0)
    handleReplayStepResponse('s1', 'not-a1', 'pass')
    expect(broadcasts('REPLAY_STEP_RESULT')).toHaveLength(0)

    handleReplayStepResponse('s1', 'a1', 'pass')
    await runToCompletion(run)
    expect(broadcasts('REPLAY_STEP_RESULT')).toHaveLength(1)
  })
})
