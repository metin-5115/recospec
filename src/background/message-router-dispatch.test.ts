import { describe, it, expect, beforeEach, vi } from 'vitest'

type RouterHandler = (message: unknown, sender: unknown) => unknown

const h = vi.hoisted(() => {
  const names = [
    'startSession',
    'stopSession',
    'pauseSession',
    'resumeSession',
    'deleteSessionById',
    'renameSessionById',
    'resumeCaptureOnReady',
    'aggregateEvent',
    'attachFingerprint',
    'handleCodeGenerate',
    'handleAssertionProbeStart',
    'handleAssertionProbeStop',
    'handleAssertionSuggestion',
    'handleAssertionThumbnailRequest',
    'handleAssertionAdd',
    'handleStepsReordered',
    'handleStepUpdated',
    'handleStepDeleted',
    'handleHighlightLocator',
    'handleValidateLocators',
    'handleValidationResponse',
    'handleIterationAccept',
    'handleIterationDismiss',
    'startReplay',
    'abortReplay',
    'handleReplayStepResponse',
  ] as const
  const fns = Object.fromEntries(names.map((n) => [n, vi.fn(async () => undefined)])) as Record<
    (typeof names)[number],
    ReturnType<typeof vi.fn>
  >
  return { fns, registered: undefined as undefined | RouterHandler }
})

vi.mock('@shared/messaging/listen', () => ({
  onBackgroundMessage: (handler: RouterHandler) => {
    h.registered = handler
    return () => undefined
  },
}))
vi.mock('@shared/messaging/send', () => ({ broadcastToUI: vi.fn(async () => undefined) }))
vi.mock('@shared/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('./session-manager', () => h.fns)
vi.mock('./event-aggregator', () => h.fns)
vi.mock('./codegen-orchestrator', () => h.fns)
vi.mock('./assertion-handler', () => h.fns)
vi.mock('./step-controller', () => h.fns)
vi.mock('./locator-validation-controller', () => h.fns)
vi.mock('./iteration-controller', () => h.fns)
vi.mock('./replay-controller', () => h.fns)

import { initMessageRouter } from './message-router'

const route = (message: unknown, sender: unknown = {}): unknown => {
  if (!h.registered) throw new Error('router did not register a listener')
  return h.registered(message, sender)
}

describe('message router dispatch', () => {
  beforeEach(() => {
    for (const fn of Object.values(h.fns)) fn.mockClear()
    initMessageRouter()
  })

  const cases: Array<[string, Record<string, unknown>, keyof typeof h.fns, unknown[]]> = [
    ['SESSION_PAUSE', { sessionId: 's' }, 'pauseSession', ['s']],
    ['SESSION_RESUME', { sessionId: 's' }, 'resumeSession', ['s']],
    ['SESSION_DELETE', { sessionId: 's' }, 'deleteSessionById', ['s']],
    ['SESSION_RENAME', { sessionId: 's', name: 'n' }, 'renameSessionById', ['s', 'n']],
    [
      'ACTION_FINGERPRINT',
      { sessionId: 's', eventId: 'e', fingerprint: 'f' },
      'attachFingerprint',
      ['s', 'e', 'f'],
    ],
    ['ASSERTION_PROBE_START', { sessionId: 's' }, 'handleAssertionProbeStart', ['s']],
    ['ASSERTION_PROBE_STOP', { sessionId: 's' }, 'handleAssertionProbeStop', ['s']],
    [
      'ASSERTION_THUMBNAIL_REQUEST',
      { sessionId: 's', elementRect: { x: 1 } },
      'handleAssertionThumbnailRequest',
      [{ x: 1 }],
    ],
    [
      'STEPS_REORDERED',
      { sessionId: 's', orderedActionIds: ['a', 'b'] },
      'handleStepsReordered',
      ['s', ['a', 'b']],
    ],
    [
      'STEP_UPDATED',
      { sessionId: 's', actionId: 'a', patch: { p: 1 } },
      'handleStepUpdated',
      ['s', 'a', { p: 1 }],
    ],
    ['STEP_DELETED', { sessionId: 's', actionId: 'a' }, 'handleStepDeleted', ['s', 'a']],
    [
      'VALIDATE_LOCATORS',
      { sessionId: 's', targets: [1], recordedUrl: 'u' },
      'handleValidateLocators',
      ['s', [1], 'u'],
    ],
    [
      'SESSION_ITERATION_ACCEPT',
      { sessionId: 's', parentSessionId: 'p' },
      'handleIterationAccept',
      ['s', 'p'],
    ],
    ['SESSION_ITERATION_DISMISS', { sessionId: 's' }, 'handleIterationDismiss', ['s']],
    ['REPLAY_REQUEST', { sessionId: 's' }, 'startReplay', ['s']],
  ]

  it.each(cases)('%s reaches its handler with the message fields', async (type, rest, fn, args) => {
    await route({ type, ...rest })
    expect(h.fns[fn]).toHaveBeenCalledWith(...args)
  })

  it('forwards the replay step response synchronously', () => {
    expect(
      route({
        type: 'REPLAY_STEP_RESPONSE',
        sessionId: 's',
        actionId: 'a',
        status: 'ok',
        error: undefined,
      }),
    ).toBeUndefined()
    expect(h.fns.handleReplayStepResponse).toHaveBeenCalledWith('s', 'a', 'ok', undefined)
  })

  it('aborts a replay synchronously', () => {
    expect(route({ type: 'REPLAY_ABORT', sessionId: 's' })).toBeUndefined()
    expect(h.fns.abortReplay).toHaveBeenCalledWith('s')
  })

  it('ignores CONTENT_READY when the sender has no tab', () => {
    expect(route({ type: 'CONTENT_READY' }, {})).toBeUndefined()
    expect(h.fns.resumeCaptureOnReady).not.toHaveBeenCalled()
  })

  it('resumes capture for the tab that reported CONTENT_READY', async () => {
    await route({ type: 'CONTENT_READY' }, { tab: { id: 7 } })
    expect(h.fns.resumeCaptureOnReady).toHaveBeenCalledWith(7)
  })

  it('swallows a handler rejection instead of leaving it unhandled', async () => {
    h.fns.pauseSession.mockRejectedValueOnce(new Error('boom'))
    await expect(route({ type: 'SESSION_PAUSE', sessionId: 's' })).resolves.toBeUndefined()
  })
})
