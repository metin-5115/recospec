import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IndexedDBQuotaError } from '@shared/errors'

type RouterHandler = (message: unknown, sender: unknown) => unknown

const mocks = vi.hoisted(() => ({
  handler: undefined as undefined | ((message: unknown, sender: unknown) => unknown),
  broadcastToUI: vi.fn(async () => undefined),
  startSession: vi.fn(async () => undefined),
  stopSession: vi.fn(async () => undefined),
  resumeCaptureOnReady: vi.fn(async () => undefined),
  aggregateEvent: vi.fn(async () => undefined),
  handleCodeGenerate: vi.fn(async () => undefined),
  startReplay: vi.fn(async () => undefined),
  abortReplay: vi.fn(),
  handleReplayStepResponse: vi.fn(),
  handleExportRequest: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@shared/messaging/listen', () => ({
  onBackgroundMessage: (h: (message: unknown, sender: unknown) => unknown) => {
    mocks.handler = h
    return () => undefined
  },
}))
vi.mock('@shared/messaging/send', () => ({ broadcastToUI: mocks.broadcastToUI }))
vi.mock('@shared/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('./session-manager', () => ({
  startSession: mocks.startSession,
  stopSession: mocks.stopSession,
  pauseSession: vi.fn(async () => undefined),
  resumeSession: vi.fn(async () => undefined),
  deleteSessionById: vi.fn(async () => undefined),
  renameSessionById: vi.fn(async () => undefined),
  resumeCaptureOnReady: mocks.resumeCaptureOnReady,
}))
vi.mock('./event-aggregator', () => ({ aggregateEvent: mocks.aggregateEvent }))
vi.mock('./codegen-orchestrator', () => ({ handleCodeGenerate: mocks.handleCodeGenerate }))
vi.mock('./assertion-handler', () => ({
  handleAssertionProbeStart: vi.fn(async () => undefined),
  handleAssertionProbeStop: vi.fn(async () => undefined),
  handleAssertionSuggestion: vi.fn(async () => undefined),
  handleAssertionAdd: vi.fn(async () => undefined),
}))
vi.mock('./step-controller', () => ({
  handleStepsReordered: vi.fn(async () => undefined),
  handleStepUpdated: vi.fn(async () => undefined),
  handleStepDeleted: vi.fn(async () => undefined),
}))
vi.mock('./locator-validation-controller', () => ({
  handleHighlightLocator: vi.fn(async () => undefined),
  handleValidateLocators: vi.fn(async () => undefined),
  handleValidationResponse: vi.fn(async () => undefined),
}))
vi.mock('./iteration-controller', () => ({
  handleIterationAccept: vi.fn(async () => undefined),
  handleIterationDismiss: vi.fn(async () => undefined),
}))
vi.mock('./export-handler', () => ({ handleExportRequest: mocks.handleExportRequest }))
vi.mock('./replay-controller', () => ({
  startReplay: mocks.startReplay,
  abortReplay: mocks.abortReplay,
  handleReplayStepResponse: mocks.handleReplayStepResponse,
}))

import { initMessageRouter } from './message-router'

function dispatch(message: unknown, sender: unknown = {}): unknown {
  const handler = mocks.handler as RouterHandler | undefined
  if (!handler) throw new Error('router did not register a listener')
  return handler(message, sender)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handler = undefined
  initMessageRouter()
})

describe('message router — dispatch', () => {
  it('routes SESSION_STOP to stopSession with the session id', async () => {
    await dispatch({ type: 'SESSION_STOP', sessionId: 's1' })
    expect(mocks.stopSession).toHaveBeenCalledWith('s1')
  })

  it('routes EVENT_CAPTURED to the aggregator', async () => {
    const event = { type: 'click' }
    await dispatch({ type: 'EVENT_CAPTURED', sessionId: 's1', event })
    expect(mocks.aggregateEvent).toHaveBeenCalledWith('s1', event)
  })

  it('forwards every CODE_GENERATE option to the orchestrator', async () => {
    await dispatch({
      type: 'CODE_GENERATE',
      sessionId: 's1',
      framework: 'cypress',
      includeMocks: true,
      autoWaitEnabled: false,
      bdd: true,
    })
    expect(mocks.handleCodeGenerate).toHaveBeenCalledWith(
      's1',
      'cypress',
      expect.objectContaining({ includeMocks: true, autoWaitEnabled: false, bdd: true }),
    )
  })

  it('REPLAY_ABORT is synchronous and returns nothing', () => {
    const result = dispatch({ type: 'REPLAY_ABORT', sessionId: 's1' })
    expect(result).toBeUndefined()
    expect(mocks.abortReplay).toHaveBeenCalledWith('s1')
  })

  it('REPLAY_STEP_RESPONSE hands the result to the replay controller', () => {
    dispatch({
      type: 'REPLAY_STEP_RESPONSE',
      sessionId: 's1',
      actionId: 'a1',
      status: 'fail',
      error: 'boom',
    })
    expect(mocks.handleReplayStepResponse).toHaveBeenCalledWith('s1', 'a1', 'fail', 'boom')
  })

  it('resumes capture for the tab that reported CONTENT_READY', async () => {
    await dispatch({ type: 'CONTENT_READY' }, { tab: { id: 42 } })
    expect(mocks.resumeCaptureOnReady).toHaveBeenCalledWith(42)
  })

  it('ignores CONTENT_READY from a sender without a tab', () => {
    const result = dispatch({ type: 'CONTENT_READY' }, {})
    expect(result).toBeUndefined()
    expect(mocks.resumeCaptureOnReady).not.toHaveBeenCalled()
  })

  it('drops the export payload so the handler resolves to void', async () => {
    const result = await dispatch({ type: 'EXPORT_REQUEST', sessionId: 's1' })
    expect(result).toBeUndefined()
    expect(mocks.handleExportRequest).toHaveBeenCalledWith('s1')
  })
})

describe('message router — error handling', () => {
  it('broadcasts STORAGE_QUOTA_EXCEEDED when a handler hits the IndexedDB quota', async () => {
    mocks.aggregateEvent.mockRejectedValueOnce(new IndexedDBQuotaError())
    await dispatch({ type: 'EVENT_CAPTURED', sessionId: 's1', event: {} })
    expect(mocks.broadcastToUI).toHaveBeenCalledWith({
      type: 'STORAGE_QUOTA_EXCEEDED',
      sessionId: 's1',
    })
  })

  it('also recognises a raw QuotaExceededError from Dexie', async () => {
    const raw = Object.assign(new Error('full'), { name: 'QuotaExceededError' })
    mocks.stopSession.mockRejectedValueOnce(raw)
    await dispatch({ type: 'SESSION_STOP', sessionId: 's2' })
    expect(mocks.broadcastToUI).toHaveBeenCalledWith({
      type: 'STORAGE_QUOTA_EXCEEDED',
      sessionId: 's2',
    })
  })

  it('swallows an ordinary failure without a quota broadcast', async () => {
    mocks.startReplay.mockRejectedValueOnce(new Error('tab closed'))
    await expect(dispatch({ type: 'REPLAY_REQUEST', sessionId: 's1' })).resolves.toBeUndefined()
    expect(mocks.broadcastToUI).not.toHaveBeenCalled()
  })
})
