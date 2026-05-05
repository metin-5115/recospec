import { db } from './db'
import type { RecordedAction } from '@shared/types/action'

export async function appendAction(action: RecordedAction): Promise<void> {
  await db.actions.add(action)
}

export async function getActionsBySession(sessionId: string): Promise<RecordedAction[]> {
  return db.actions.where('sessionId').equals(sessionId).sortBy('sequenceNumber')
}

export async function deleteActionsBySession(sessionId: string): Promise<void> {
  await db.actions.where('sessionId').equals(sessionId).delete()
}
