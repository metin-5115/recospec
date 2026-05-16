import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import {
  appendAction,
  getActionsBySession,
  reorderActions,
  updateAction,
  deleteAction,
  getAction,
} from './action-repo'
import type { RecordedAction } from '@shared/types/action'
import type { ScoredLocator } from '@shared/types/locator'

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
    timestamp: Date.now() + sequenceNumber,
    pageUrl: 'https://example.com',
  }
}

function makeLocator(
  strategy: ScoredLocator['strategy'],
  selector: string,
  score: number,
): ScoredLocator {
  return { strategy, selector, framework: {}, score, matchCount: 1 }
}

beforeEach(async () => {
  await db.actions.clear()
  await db.sessions.clear()
})

describe('action-repo: reorderActions', () => {
  it('renumbers sequenceNumbers 0..n-1 in the supplied order', async () => {
    const sessionId = 's1'
    const a1 = makeAction(sessionId, 0)
    const a2 = makeAction(sessionId, 1)
    const a3 = makeAction(sessionId, 2)
    await appendAction(a1)
    await appendAction(a2)
    await appendAction(a3)

    const reordered = await reorderActions(sessionId, [a3.actionId, a1.actionId, a2.actionId])

    expect(reordered.map((a) => a.actionId)).toEqual([a3.actionId, a1.actionId, a2.actionId])
    expect(reordered.map((a) => a.sequenceNumber)).toEqual([0, 1, 2])
  })

  it('persists the new order so subsequent reads return the reordered list', async () => {
    const sessionId = 's2'
    const a = makeAction(sessionId, 0)
    const b = makeAction(sessionId, 1)
    await appendAction(a)
    await appendAction(b)

    await reorderActions(sessionId, [b.actionId, a.actionId])
    const fresh = await getActionsBySession(sessionId)
    expect(fresh.map((x) => x.actionId)).toEqual([b.actionId, a.actionId])
  })

  it('throws when an actionId does not belong to the session', async () => {
    const sessionId = 's3'
    const a = makeAction(sessionId, 0)
    await appendAction(a)
    await appendAction(makeAction(sessionId, 1))
    await expect(reorderActions(sessionId, [a.actionId, 'bogus'])).rejects.toThrow(
      /does not belong/,
    )
  })

  it('throws when ordering length differs from session size', async () => {
    const sessionId = 's4'
    const a = makeAction(sessionId, 0)
    const b = makeAction(sessionId, 1)
    await appendAction(a)
    await appendAction(b)
    await expect(reorderActions(sessionId, [a.actionId])).rejects.toThrow(/expected 2/)
  })

  it('throws on duplicate actionId in ordering', async () => {
    const sessionId = 's5'
    const a = makeAction(sessionId, 0)
    const b = makeAction(sessionId, 1)
    await appendAction(a)
    await appendAction(b)
    await expect(reorderActions(sessionId, [a.actionId, a.actionId])).rejects.toThrow(/duplicate/)
  })
})

describe('action-repo: updateAction', () => {
  it('partial-merges the patch into the stored action', async () => {
    const sessionId = 's10'
    const a = makeAction(sessionId, 0, 'fill')
    a.payload = { value: 'old' }
    await appendAction(a)

    await updateAction(a.actionId, { payload: { value: 'new', delay: 250 } })

    const fetched = await getAction(a.actionId)
    expect(fetched?.payload).toEqual({ value: 'new', delay: 250 })
  })

  it('overwrites target with a fully-prepared object', async () => {
    const sessionId = 's11'
    const a = makeAction(sessionId, 0)
    a.target = {
      primaryLocator: makeLocator('css', '#x', 50),
      fallbackLocators: [],
      elementSnapshot: { tagName: 'button', attributes: {}, textContent: '' },
    }
    await appendAction(a)

    const newPrimary = makeLocator('testid', 'submit', 95)
    await updateAction(a.actionId, {
      target: {
        ...a.target,
        primaryLocator: newPrimary,
        fallbackLocators: [makeLocator('css', '#x', 50)],
        userOverridden: true,
      },
    })

    const fetched = await getAction(a.actionId)
    expect(fetched?.target?.primaryLocator.strategy).toBe('testid')
    expect(fetched?.target?.userOverridden).toBe(true)
    expect(fetched?.target?.fallbackLocators).toHaveLength(1)
  })

  it('is a no-op for an empty patch', async () => {
    const sessionId = 's12'
    const a = makeAction(sessionId, 0)
    await appendAction(a)
    await expect(updateAction(a.actionId, {})).resolves.toBeUndefined()
    const fetched = await getAction(a.actionId)
    expect(fetched?.actionId).toBe(a.actionId)
  })
})

describe('action-repo: deleteAction', () => {
  it('removes the action and renumbers survivors contiguously', async () => {
    const sessionId = 's20'
    const a1 = makeAction(sessionId, 0)
    const a2 = makeAction(sessionId, 1)
    const a3 = makeAction(sessionId, 2)
    await appendAction(a1)
    await appendAction(a2)
    await appendAction(a3)

    const survivors = await deleteAction(sessionId, a2.actionId)
    expect(survivors.map((s) => s.actionId)).toEqual([a1.actionId, a3.actionId])
    expect(survivors.map((s) => s.sequenceNumber)).toEqual([0, 1])
  })
})
