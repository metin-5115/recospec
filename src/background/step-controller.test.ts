import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@storage/db'
import { appendAction } from '@storage/action-repo'
import { createSession } from '@storage/session-repo'
import { handleStepsReordered, handleStepUpdated, handleStepDeleted } from './step-controller'
import type { RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'
import type { ScoredLocator } from '@shared/types/locator'

const broadcasts: unknown[] = []

beforeEach(async () => {
  await db.actions.clear()
  await db.sessions.clear()
  broadcasts.length = 0
  ;(globalThis as unknown as { chrome: typeof chrome }).chrome = {
    runtime: {
      sendMessage: vi.fn(async (msg: unknown) => {
        broadcasts.push(msg)
      }),
    },
  } as unknown as typeof chrome
})

function makeStoppedSession(sessionId = 's1'): Session {
  return {
    sessionId,
    name: 'T',
    state: 'stopped',
    startUrl: 'https://example.com',
    startedAt: 0,
    metadata: { userAgent: 'x', viewport: { width: 0, height: 0 }, timezone: 'UTC' },
    config: { captureClicks: true, captureInputs: true, captureNavigation: true },
  }
}

function makeAction(
  sessionId: string,
  sequenceNumber: number,
  type: 'click' | 'fill' = 'click',
): RecordedAction {
  return {
    actionId: crypto.randomUUID(),
    sessionId,
    sequenceNumber,
    type,
    timestamp: 0,
    pageUrl: 'https://example.com',
  }
}

function loc(strategy: ScoredLocator['strategy'], selector: string, score: number): ScoredLocator {
  return { strategy, selector, framework: {}, score, matchCount: 1 }
}

describe('step-controller integration', () => {
  it('handleStepsReordered persists new order and broadcasts STEPS_SYNCED', async () => {
    const session = makeStoppedSession()
    await createSession(session)
    const a = makeAction(session.sessionId, 0)
    const b = makeAction(session.sessionId, 1)
    const c = makeAction(session.sessionId, 2)
    await appendAction(a)
    await appendAction(b)
    await appendAction(c)

    await handleStepsReordered(session.sessionId, [c.actionId, a.actionId, b.actionId])

    const synced = broadcasts.find(
      (m): m is { type: 'STEPS_SYNCED'; steps: RecordedAction[] } =>
        typeof m === 'object' && m !== null && (m as { type?: string }).type === 'STEPS_SYNCED',
    )
    expect(synced).toBeTruthy()
    expect(synced!.steps.map((s) => s.actionId)).toEqual([c.actionId, a.actionId, b.actionId])
  })

  it('handleStepsReordered refuses while session is recording', async () => {
    const session: Session = { ...makeStoppedSession(), state: 'recording' }
    await createSession(session)
    const a = makeAction(session.sessionId, 0)
    const b = makeAction(session.sessionId, 1)
    await appendAction(a)
    await appendAction(b)

    await handleStepsReordered(session.sessionId, [b.actionId, a.actionId])
    const persisted = await db.actions
      .where('sessionId')
      .equals(session.sessionId)
      .sortBy('sequenceNumber')
    expect(persisted.map((s) => s.actionId)).toEqual([a.actionId, b.actionId])
    expect(broadcasts).toHaveLength(0)
  })

  it('handleStepUpdated merges target with userOverridden=true', async () => {
    const session = makeStoppedSession('s2')
    await createSession(session)
    const action = makeAction(session.sessionId, 0)
    action.target = {
      primaryLocator: loc('css', '#x', 50),
      fallbackLocators: [],
      elementSnapshot: { tagName: 'button', attributes: {}, textContent: '' },
    }
    await appendAction(action)

    const newPrimary = loc('testid', 'submit', 95)
    await handleStepUpdated(session.sessionId, action.actionId, {
      target: {
        ...action.target,
        primaryLocator: newPrimary,
        fallbackLocators: [loc('css', '#x', 50)],
        userOverridden: true,
      },
    })

    const fetched = await db.actions.get(action.actionId)
    expect(fetched?.target?.primaryLocator.strategy).toBe('testid')
    expect(fetched?.target?.userOverridden).toBe(true)
    expect(
      broadcasts.some(
        (m) => typeof m === 'object' && (m as { type?: string }).type === 'STEPS_SYNCED',
      ),
    ).toBe(true)
  })

  it('handleStepDeleted removes the row and renumbers survivors', async () => {
    const session = makeStoppedSession('s3')
    await createSession(session)
    const a = makeAction(session.sessionId, 0)
    const b = makeAction(session.sessionId, 1)
    const c = makeAction(session.sessionId, 2)
    await appendAction(a)
    await appendAction(b)
    await appendAction(c)

    await handleStepDeleted(session.sessionId, b.actionId)

    const remaining = await db.actions
      .where('sessionId')
      .equals(session.sessionId)
      .sortBy('sequenceNumber')
    expect(remaining.map((s) => s.actionId)).toEqual([a.actionId, c.actionId])
    expect(remaining.map((s) => s.sequenceNumber)).toEqual([0, 1])
  })
})
