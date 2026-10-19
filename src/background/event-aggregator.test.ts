import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@storage/db'
import { getActionsBySession } from '@storage/action-repo'
import { createSession, getSession } from '@storage/session-repo'
import { ITERATION_SIGNATURE_STEPS, NETWORK_BATCH_WINDOW_MS } from '@shared/constants'
import type { CapturedEvent, ElementSnapshot } from '@shared/types/action'
import type { Session } from '@shared/types/session'
import { aggregateEvent, flushNetworkBatch } from './event-aggregator'

const broadcasts: Array<{ type: string } & Record<string, unknown>> = []

beforeEach(async () => {
  await db.actions.clear()
  await db.sessions.clear()
  broadcasts.length = 0
  ;(globalThis as unknown as { chrome: typeof chrome }).chrome = {
    runtime: {
      sendMessage: vi.fn(async (msg: unknown) => {
        broadcasts.push(msg as (typeof broadcasts)[number])
      }),
    },
  } as unknown as typeof chrome
})

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 's1',
    name: 'Checkout',
    state: 'recording',
    startUrl: 'https://example.com/',
    startedAt: 0,
    metadata: { userAgent: 'x', viewport: { width: 0, height: 0 }, timezone: 'UTC' },
    config: { captureClicks: true, captureInputs: true, captureNavigation: true },
    iterationNumber: 1,
    flowSignature: 'placeholder',
    ...overrides,
  }
}

const SNAPSHOT: ElementSnapshot = { tagName: 'button', textContent: 'Buy' } as ElementSnapshot

function clickEvent(timestamp: number, withTarget = true): CapturedEvent {
  return {
    type: 'click',
    timestamp,
    target: withTarget ? { locatorBundle: null, elementSnapshot: SNAPSHOT } : null,
    pageMetadata: { url: 'https://example.com/cart', title: '' },
  }
}

describe('aggregateEvent', () => {
  it('persists the action with a zero-based sequence number and broadcasts it', async () => {
    await createSession(makeSession())

    await aggregateEvent('s1', clickEvent(10))
    await aggregateEvent('s1', clickEvent(20))

    const actions = await getActionsBySession('s1')
    expect(actions.map((a) => a.sequenceNumber)).toEqual([0, 1])
    const recorded = broadcasts.filter((m) => m.type === 'STEP_RECORDED')
    expect(recorded).toHaveLength(2)
    expect(recorded[0]).toMatchObject({ sessionId: 's1' })
  })

  it('gives every event of a concurrent burst a unique, contiguous sequence number', async () => {
    await createSession(makeSession())

    await Promise.all(Array.from({ length: 20 }, (_, i) => aggregateEvent('s1', clickEvent(i))))

    const actions = await getActionsBySession('s1')
    expect(actions.map((a) => a.sequenceNumber)).toEqual(Array.from({ length: 20 }, (_, i) => i))
    const recorded = broadcasts.filter((m) => m.type === 'STEP_RECORDED')
    expect(
      new Set(recorded.map((m) => (m.step as { sequenceNumber: number }).sequenceNumber)).size,
    ).toBe(20)
  })

  it('does not read back the whole session for every captured event', async () => {
    await createSession(makeSession())
    await aggregateEvent('s1', clickEvent(0))
    const toArray = vi.spyOn(Object.getPrototypeOf(db.actions.toCollection()) as never, 'toArray')
    const sortBy = vi.spyOn(Object.getPrototypeOf(db.actions.toCollection()) as never, 'sortBy')

    await aggregateEvent('s1', clickEvent(1))

    expect(toArray).not.toHaveBeenCalled()
    expect(sortBy).not.toHaveBeenCalled()
    toArray.mockRestore()
    sortBy.mockRestore()
  })

  it('turns an empty page title into undefined', async () => {
    await createSession(makeSession())
    await aggregateEvent('s1', clickEvent(10))
    const [action] = await getActionsBySession('s1')
    expect(action.pageTitle).toBeUndefined()
    expect(action.pageUrl).toBe('https://example.com/cart')
  })

  it('flags a targeted element that produced no locator at the top level', async () => {
    await createSession(makeSession())
    await aggregateEvent('s1', clickEvent(10, true))
    const [action] = await getActionsBySession('s1')
    expect(action.target).toBeUndefined()
    expect(action.quality).toBeDefined()
    expect(action.quality?.level).not.toBe('ok')
  })

  it('does not flag an event that has no target element at all', async () => {
    await createSession(makeSession())
    await aggregateEvent('s1', clickEvent(10, false))
    const [action] = await getActionsBySession('s1')
    expect(action.quality).toBeUndefined()
  })
})

describe('iteration suggestion', () => {
  async function recordSteps(sessionId: string, count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      await aggregateEvent(sessionId, clickEvent(i))
    }
  }

  it('is not raised before enough steps exist to discriminate the flow', async () => {
    await createSession(makeSession())
    await recordSteps('s1', ITERATION_SIGNATURE_STEPS - 1)
    expect(broadcasts.some((m) => m.type === 'SESSION_ITERATION_SUGGESTED')).toBe(false)
  })

  it('replaces the placeholder signature once the Nth step arrives', async () => {
    await createSession(makeSession())
    await recordSteps('s1', ITERATION_SIGNATURE_STEPS)
    const session = await getSession('s1')
    expect(session?.flowSignature).not.toBe('placeholder')
  })

  it('suggests the previously stopped session that shares the flow shape', async () => {
    await createSession(makeSession({ sessionId: 'parent', name: 'Checkout', state: 'recording' }))
    await recordSteps('parent', ITERATION_SIGNATURE_STEPS)
    await db.sessions.update('parent', { state: 'stopped', stoppedAt: 99 })
    broadcasts.length = 0

    await createSession(makeSession({ sessionId: 'child', name: 'Checkout again' }))
    await recordSteps('child', ITERATION_SIGNATURE_STEPS)

    const suggestion = broadcasts.find((m) => m.type === 'SESSION_ITERATION_SUGGESTED')
    expect(suggestion).toMatchObject({ sessionId: 'child', parentSessionId: 'parent' })
  })

  it('does not suggest again for a session that is already linked to a parent', async () => {
    await createSession(makeSession({ sessionId: 'parent', state: 'recording' }))
    await recordSteps('parent', ITERATION_SIGNATURE_STEPS)
    await db.sessions.update('parent', { state: 'stopped', stoppedAt: 99 })
    broadcasts.length = 0

    await createSession(makeSession({ sessionId: 'child', parentSessionId: 'parent' }))
    await recordSteps('child', ITERATION_SIGNATURE_STEPS)

    expect(broadcasts.some((m) => m.type === 'SESSION_ITERATION_SUGGESTED')).toBe(false)
  })
})

describe('aggregateEvent — network batching', () => {
  const WINDOW_SLACK_MS = 80

  function networkEvent(timestamp: number, status = 200): CapturedEvent {
    return {
      type: 'network',
      timestamp,
      target: null,
      pageMetadata: { url: 'https://example.com/cart', title: '' },
      payload: {
        method: 'GET',
        url: `https://example.com/api/${timestamp}`,
        status,
        contentType: 'application/json',
        responseBody: '{"big":"body"}',
      },
    }
  }

  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

  it('writes the events of one window in a single transaction and one broadcast', async () => {
    await createSession(makeSession())
    const spy = vi.spyOn(db, 'transaction')

    await Promise.all([
      aggregateEvent('s1', networkEvent(1)),
      aggregateEvent('s1', networkEvent(2)),
      aggregateEvent('s1', networkEvent(3)),
    ])

    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
    expect((await getActionsBySession('s1')).map((a) => a.sequenceNumber)).toEqual([0, 1, 2])
    const batches = broadcasts.filter((m) => m.type === 'NETWORK_STEPS_RECORDED')
    expect(batches).toHaveLength(1)
    expect(broadcasts.filter((m) => m.type === 'STEP_RECORDED')).toHaveLength(0)
  })

  it('tells the UI about the calls without their response bodies', async () => {
    await createSession(makeSession())
    await aggregateEvent('s1', networkEvent(1))

    const batch = broadcasts.find((m) => m.type === 'NETWORK_STEPS_RECORDED') as unknown as {
      steps: Array<{ payload?: Record<string, unknown> }>
    }
    expect(batch.steps).toHaveLength(1)
    expect(batch.steps[0]?.payload).toMatchObject({ method: 'GET', status: 200 })
    expect(batch.steps[0]?.payload).not.toHaveProperty('responseBody')
    // The stored action keeps the body — mocks are generated from it.
    expect((await getActionsBySession('s1'))[0]?.payload).toHaveProperty('responseBody')
  })

  it('persists a pending batch before a later click, keeping the recorded order', async () => {
    await createSession(makeSession())
    const network = aggregateEvent('s1', networkEvent(1))
    const startedAt = Date.now()
    await aggregateEvent('s1', clickEvent(2))
    const waited = Date.now() - startedAt
    await network

    expect(waited).toBeLessThan(NETWORK_BATCH_WINDOW_MS)
    expect((await getActionsBySession('s1')).map((a) => a.type)).toEqual(['network', 'click'])
  })

  it('flushNetworkBatch writes what is pending without waiting for the window', async () => {
    await createSession(makeSession())
    const pending = aggregateEvent('s1', networkEvent(1))
    await flushNetworkBatch()
    expect(await getActionsBySession('s1')).toHaveLength(1)
    await pending
  })

  it('does not hold the first call of a quiet period back longer than the window', async () => {
    await createSession(makeSession())
    const startedAt = Date.now()
    await aggregateEvent('s1', networkEvent(1))
    expect(Date.now() - startedAt).toBeLessThan(NETWORK_BATCH_WINDOW_MS + WINDOW_SLACK_MS)
    await wait(0)
  })

  it('still suggests an iteration when a batch contains the signature-completing step', async () => {
    await createSession(makeSession())
    await Promise.all(
      Array.from({ length: ITERATION_SIGNATURE_STEPS }, (_, i) =>
        aggregateEvent('s1', networkEvent(i + 1)),
      ),
    )
    const stored = await getSession('s1')
    expect(stored?.flowSignature).not.toBe('placeholder')
  })
})
