import { db } from './db'
import type { RecordedAction } from '@shared/types/action'
import type { StepPatch } from '@shared/types/messages'
import { IndexedDBQuotaError, isQuotaExceededError } from '@shared/errors'

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

export async function getActionsBySession(sessionId: string): Promise<RecordedAction[]> {
  return db.actions.where('sessionId').equals(sessionId).sortBy('sequenceNumber')
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
  return db.actions
    .where('sessionId')
    .equals(sessionId)
    .sortBy('sequenceNumber')
    .then((all) => all.slice(offset, offset + limit))
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

    for (let i = 0; i < orderedActionIds.length; i++) {
      await db.actions.update(orderedActionIds[i], { sequenceNumber: i })
    }
    return db.actions.where('sessionId').equals(sessionId).sortBy('sequenceNumber')
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
    const remaining = await db.actions.where('sessionId').equals(sessionId).sortBy('sequenceNumber')
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].sequenceNumber !== i) {
        await db.actions.update(remaining[i].actionId, { sequenceNumber: i })
        remaining[i].sequenceNumber = i
      }
    }
    return remaining
  })
}
