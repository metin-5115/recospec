import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Dexie from 'dexie'
import { db } from './db'
import { DB_NAME } from '@shared/constants'
import {
  appendAction,
  appendNextAction,
  deleteAction,
  getActionsBySession,
  getActionsBySessionPage,
  reorderActions,
} from './action-repo'
import type { RecordedAction } from '@shared/types/action'

function makeAction(sessionId: string, sequenceNumber: number): RecordedAction {
  return {
    actionId: crypto.randomUUID(),
    sessionId,
    sequenceNumber,
    type: 'click',
    timestamp: Date.now() + sequenceNumber,
    pageUrl: 'https://example.com',
  }
}

/** Dexie does not export `Collection` as a value; reach its prototype through an instance. */
function collectionProto(): object {
  return Object.getPrototypeOf(db.actions.toCollection()) as object
}

type ActionDraft = Omit<RecordedAction, 'sequenceNumber'>

function makeDraft(sessionId: string): ActionDraft {
  return {
    actionId: crypto.randomUUID(),
    sessionId,
    type: 'click',
    timestamp: Date.now(),
    pageUrl: 'https://example.com',
  }
}

beforeEach(async () => {
  await db.actions.clear()
  await db.sessions.clear()
})

describe('action-repo: appendNextAction', () => {
  it('assigns contiguous sequence numbers under a concurrent burst', async () => {
    const drafts = Array.from({ length: 25 }, () => makeDraft('burst'))

    await Promise.all(drafts.map((d) => appendNextAction(d)))

    const stored = await getActionsBySession('burst')
    expect(stored.map((a) => a.sequenceNumber)).toEqual(Array.from({ length: 25 }, (_, i) => i))
  })

  it('returns the stored action with its assigned sequence number', async () => {
    const first = await appendNextAction(makeDraft('ret'))
    const second = await appendNextAction(makeDraft('ret'))
    expect(first.sequenceNumber).toBe(0)
    expect(second.sequenceNumber).toBe(1)
    expect((await db.actions.get(second.actionId))?.sequenceNumber).toBe(1)
  })

  it('numbers each session independently', async () => {
    await appendNextAction(makeDraft('A'))
    await appendNextAction(makeDraft('A'))
    const first = await appendNextAction(makeDraft('B'))
    expect(first.sequenceNumber).toBe(0)
  })

  it('continues after the highest existing sequence number', async () => {
    await appendAction(makeAction('cont', 0))
    await appendAction(makeAction('cont', 1))
    const next = await appendNextAction(makeDraft('cont'))
    expect(next.sequenceNumber).toBe(2)
  })

  it('does not read the whole session to number the action', async () => {
    for (let i = 0; i < 5; i++) await appendAction(makeAction('cheap', i))
    const toArray = vi.spyOn(collectionProto() as never, 'toArray')
    const sortBy = vi.spyOn(collectionProto() as never, 'sortBy')

    await appendNextAction(makeDraft('cheap'))

    expect(toArray).not.toHaveBeenCalled()
    expect(sortBy).not.toHaveBeenCalled()
    toArray.mockRestore()
    sortBy.mockRestore()
  })
})

describe('action-repo: getActionsBySessionPage', () => {
  async function seed(sessionId: string, count: number): Promise<RecordedAction[]> {
    const actions = Array.from({ length: count }, (_, i) => makeAction(sessionId, i))
    // Insert out of order so the page must come from the index, not row order.
    await db.actions.bulkAdd([...actions].reverse())
    return actions
  }

  it('returns the requested window ordered by sequenceNumber', async () => {
    const actions = await seed('p1', 10)
    const page = await getActionsBySessionPage('p1', 3, 4)
    expect(page.map((a) => a.actionId)).toEqual(actions.slice(3, 7).map((a) => a.actionId))
  })

  it('returns a short last page and an empty page past the end', async () => {
    await seed('p2', 5)
    expect(await getActionsBySessionPage('p2', 3, 10)).toHaveLength(2)
    expect(await getActionsBySessionPage('p2', 5, 10)).toEqual([])
  })

  it('ignores other sessions', async () => {
    await seed('p3', 3)
    await seed('p3-other', 3)
    const page = await getActionsBySessionPage('p3', 0, 10)
    expect(page.every((a) => a.sessionId === 'p3')).toBe(true)
    expect(page).toHaveLength(3)
  })

  it('does not load the whole session (uses the compound index)', async () => {
    await seed('p4', 6)
    const sortBy = vi.spyOn(collectionProto() as never, 'sortBy')
    await getActionsBySessionPage('p4', 0, 2)
    expect(sortBy).not.toHaveBeenCalled()
    sortBy.mockRestore()
  })
})

describe('action-repo: bulk writes', () => {
  it('reorderActions persists the order without per-row updates', async () => {
    const a = makeAction('bulk1', 0)
    const b = makeAction('bulk1', 1)
    const c = makeAction('bulk1', 2)
    await db.actions.bulkAdd([a, b, c])
    const update = vi.spyOn(db.actions, 'update')

    await reorderActions('bulk1', [c.actionId, b.actionId, a.actionId])

    expect(update).not.toHaveBeenCalled()
    const stored = await getActionsBySession('bulk1')
    expect(stored.map((s) => s.actionId)).toEqual([c.actionId, b.actionId, a.actionId])
    update.mockRestore()
  })

  it('deleteAction renumbers survivors without per-row updates', async () => {
    const actions = Array.from({ length: 5 }, (_, i) => makeAction('bulk2', i))
    await db.actions.bulkAdd(actions)
    const update = vi.spyOn(db.actions, 'update')

    const survivors = await deleteAction('bulk2', actions[1].actionId)

    expect(update).not.toHaveBeenCalled()
    expect(survivors.map((s) => s.sequenceNumber)).toEqual([0, 1, 2, 3])
    const stored = await getActionsBySession('bulk2')
    expect(stored.map((s) => s.sequenceNumber)).toEqual([0, 1, 2, 3])
    expect(stored.map((s) => s.actionId)).toEqual([0, 2, 3, 4].map((i) => actions[i].actionId))
    update.mockRestore()
  })

  it('deleteAction keeps the head contiguous when the last action is removed', async () => {
    const actions = Array.from({ length: 3 }, (_, i) => makeAction('bulk3', i))
    await db.actions.bulkAdd(actions)
    const survivors = await deleteAction('bulk3', actions[2].actionId)
    expect(survivors.map((s) => s.sequenceNumber)).toEqual([0, 1])
  })
})

describe('db schema v3: [sessionId+sequenceNumber] index', () => {
  it('declares the compound index on actions', () => {
    expect(db.actions.schema.idxByName['[sessionId+sequenceNumber]']).toBeDefined()
    expect(db.verno).toBe(3)
  })

  it('upgrades a v2 database in place and indexes its existing rows', async () => {
    db.close()
    await Dexie.delete(DB_NAME)

    const legacy = new Dexie(DB_NAME)
    legacy.version(2).stores({
      sessions:
        'sessionId, startedAt, state, name, parentSessionId, flowSignature, [parentSessionId+flowSignature]',
      actions: 'actionId, sessionId, sequenceNumber, timestamp',
      generations: 'generationId, sessionId, framework, createdAt',
      settings: 'key',
    })
    await legacy.open()
    await legacy
      .table('actions')
      .bulkAdd([makeAction('m', 1), makeAction('m', 0), makeAction('m', 2)])
    legacy.close()

    await db.open()

    const page = await getActionsBySessionPage('m', 0, 10)
    expect(page.map((a) => a.sequenceNumber)).toEqual([0, 1, 2])
  })
})
