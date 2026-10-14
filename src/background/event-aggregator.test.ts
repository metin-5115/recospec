import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@storage/db'
import { getActionsBySession } from '@storage/action-repo'
import { createSession, getSession } from '@storage/session-repo'
import { ITERATION_SIGNATURE_STEPS } from '@shared/constants'
import type { CapturedEvent, ElementSnapshot } from '@shared/types/action'
import type { Session } from '@shared/types/session'
import { aggregateEvent } from './event-aggregator'

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
