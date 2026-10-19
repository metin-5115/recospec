import { Dexie } from 'dexie'
import { db } from './db'
import type { RecordedAction } from '@shared/types/action'
import type { StepPatch } from '@shared/types/messages'
import { IndexedDBQuotaError, isQuotaExceededError } from '@shared/errors'
import type { ElementFingerprint } from '@shared/types/locator'

/**
 * Run a Dexie write and re-throw IndexedDB quota failures as a typed
 * {@link IndexedDBQuotaError} so callers (background message router) can
 * surface a recovery UI instead of swallowing the failure.
 */
async function withQuotaGuard<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (err) {
    if (isQuotaExceededError(err)) throw new IndexedDBQuotaError(err)
    throw err
  }
}

export async function appendAction(action: RecordedAction): Promise<void> {
  await withQuotaGuard(() => db.actions.add(action))
}

/** Every action of a session, in sequenceNumber order (read straight off the compound index). */
function sessionRange(sessionId: string) {
  return db.actions
    .where('[sessionId+sequenceNumber]')
    .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
}

/**
 * Appends an action, assigning its sequenceNumber atomically.
 *
 * The next number is read (one index lookup, no row loads) and the row written inside a
 * single readwrite transaction. IndexedDB serialises overlapping readwrite transactions on
 * the same store, so a burst of concurrent events can never be handed the same number.
 */
export async function appendNextAction(
  draft: Omit<RecordedAction, 'sequenceNumber'>,
): Promise<RecordedAction> {
  return withQuotaGuard(() =>
    db.transaction('rw', db.actions, async () => {
      // Dexie types the index key loosely; for this compound index it is [sessionId, sequenceNumber].
      const lastKey = (await sessionRange(draft.sessionId).lastKey()) as unknown as
        [string, number] | undefined
      const sequenceNumber = lastKey ? lastKey[1] + 1 : 0
      const action: RecordedAction = { ...draft, sequenceNumber }
      await db.actions.add(action)
      return action
    }),
  )
}

/**
 * Appends several actions in ONE readwrite transaction, numbering each session's actions
 * consecutively after what is already stored (in the order given).
 */
export async function appendNextActions(
  drafts: ReadonlyArray<Omit<RecordedAction, 'sequenceNumber'>>,
): Promise<RecordedAction[]> {
  if (drafts.length === 0) return []
  return withQuotaGuard(() =>
    db.transaction('rw', db.actions, async () => {
      const next = new Map<string, number>()
      const actions: RecordedAction[] = []
      for (const draft of drafts) {
        if (!next.has(draft.sessionId)) {
          const lastKey = (await sessionRange(draft.sessionId).lastKey()) as unknown as
            [string, number] | undefined
          next.set(draft.sessionId, lastKey ? lastKey[1] + 1 : 0)
        }
        const sequenceNumber = next.get(draft.sessionId) ?? 0
        next.set(draft.sessionId, sequenceNumber + 1)
        actions.push({ ...draft, sequenceNumber })
      }
      await db.actions.bulkAdd(actions)
      return actions
    }),
  )
}

export async function getActionsBySession(sessionId: string): Promise<RecordedAction[]> {
  return sessionRange(sessionId).toArray()
}

export async function deleteActionsBySession(sessionId: string): Promise<void> {
  await db.actions.where('sessionId').equals(sessionId).delete()
}

/** Lazy-load actions in pages. offset/limit follow DB row order (sorted by sequenceNumber). */
export async function getActionsBySessionPage(
  sessionId: string,
  offset: number,
  limit: number,
): Promise<RecordedAction[]> {
  return sessionRange(sessionId).offset(offset).limit(limit).toArray()
}

/**
 * Re-orders actions for a session, assigning sequenceNumber 0..n-1 in the given order.
 * Atomic via Dexie transaction; throws if any id does not belong to the session or
 * if the new order omits/duplicates any existing actionId.
 */
export async function reorderActions(
  sessionId: string,
  orderedActionIds: string[],
): Promise<RecordedAction[]> {
  return db.transaction('rw', db.actions, async () => {
    const existing = await db.actions.where('sessionId').equals(sessionId).toArray()
    if (existing.length !== orderedActionIds.length) {
      throw new Error(
        `reorderActions: expected ${existing.length} ids, got ${orderedActionIds.length}`,
      )
    }
    const existingIds = new Set(existing.map((a) => a.actionId))
    for (const id of orderedActionIds) {
      if (!existingIds.has(id)) {
        throw new Error(`reorderActions: actionId ${id} does not belong to session ${sessionId}`)
      }
    }
    if (new Set(orderedActionIds).size !== orderedActionIds.length) {
      throw new Error('reorderActions: duplicate actionId in ordering')
    }

    await db.actions.bulkUpdate(
      orderedActionIds.map((key, sequenceNumber) => ({ key, changes: { sequenceNumber } })),
    )
    const byId = new Map(existing.map((a) => [a.actionId, a]))
    return orderedActionIds.map((id, sequenceNumber) => ({
      ...(byId.get(id) as RecordedAction),
      sequenceNumber,
    }))
  })
}

/**
 * Partial-merge update of a single recorded action. `target.primaryLocator` /
 * `target.userOverridden` etc. can be safely overridden via the patch's `target` field —
 * Dexie's `update()` performs a shallow merge at the top level, so callers must pre-merge
 * the new `target` object themselves before passing it in.
 */
export async function updateAction(actionId: string, patch: StepPatch): Promise<void> {
  if (Object.keys(patch).length === 0) return
  await withQuotaGuard(() => db.actions.update(actionId, patch))
}

/** Adds the element fingerprint to a stored action; `false` when there is no such action to attach it to. */
export async function setActionFingerprint(
  actionId: string,
  fingerprint: ElementFingerprint,
): Promise<boolean> {
  const action = await db.actions.get(actionId)
  if (!action?.target) return false
  await withQuotaGuard(() =>
    db.actions.update(actionId, { target: { ...action.target!, fingerprint } }),
  )
  return true
}

export async function getAction(actionId: string): Promise<RecordedAction | undefined> {
  return db.actions.get(actionId)
}

/**
 * Deletes a single action and renumbers the remaining session actions to keep
 * sequenceNumber contiguous (0..n-1). Returns the renumbered survivors.
 */
export async function deleteAction(sessionId: string, actionId: string): Promise<RecordedAction[]> {
  return db.transaction('rw', db.actions, async () => {
    await db.actions.delete(actionId)
    const remaining = await sessionRange(sessionId).toArray()
    const stale: { key: string; changes: { sequenceNumber: number } }[] = []
    remaining.forEach((action, i) => {
      if (action.sequenceNumber === i) return
      stale.push({ key: action.actionId, changes: { sequenceNumber: i } })
      action.sequenceNumber = i
    })
    if (stale.length > 0) await db.actions.bulkUpdate(stale)
    return remaining
  })
}
