import { db } from './db'
import { deleteActionsBySession } from './action-repo'
import type { Session, SessionState } from '@shared/types/session'
import { GC_ARCHIVED_DAYS, STORAGE_QUOTA_WARN_RATIO } from '@shared/constants'

export async function createSession(session: Session): Promise<void> {
  await db.sessions.add(session)
}

export async function getSession(sessionId: string): Promise<Session | undefined> {
  return db.sessions.get(sessionId)
}

export async function updateSession(
  sessionId: string,
  patch: Partial<Pick<Session, 'state' | 'stoppedAt' | 'name'>>,
): Promise<void> {
  await db.sessions.update(sessionId, patch)
}

export async function listSessions(): Promise<Session[]> {
  return db.sessions.orderBy('startedAt').reverse().toArray()
}

export async function listSessionsByState(state: SessionState): Promise<Session[]> {
  return db.sessions.where('state').equals(state).toArray()
}

export async function archiveSession(sessionId: string): Promise<void> {
  await db.sessions.update(sessionId, { state: 'archived' })
}

export async function deleteSession(sessionId: string): Promise<void> {
  await deleteActionsBySession(sessionId)
  await db.sessions.delete(sessionId)
}

/** Delete archived sessions older than GC_ARCHIVED_DAYS. Returns count deleted. */
export async function garbageCollectArchivedSessions(): Promise<number> {
  const cutoff = Date.now() - GC_ARCHIVED_DAYS * 24 * 60 * 60 * 1000
  const old = await db.sessions
    .where('state')
    .equals('archived')
    .filter((s) => (s.stoppedAt ?? s.startedAt) < cutoff)
    .toArray()

  for (const s of old) {
    await deleteActionsBySession(s.sessionId)
    await db.sessions.delete(s.sessionId)
  }
  return old.length
}

export interface StorageQuotaInfo {
  usedBytes: number
  quotaBytes: number
  ratio: number
  warn: boolean
}

/** Returns storage usage info. warn=true when usage exceeds STORAGE_QUOTA_WARN_RATIO. */
export async function checkStorageQuota(): Promise<StorageQuotaInfo> {
  const estimate = await navigator.storage.estimate()
  const usedBytes = estimate.usage ?? 0
  const quotaBytes = estimate.quota ?? Number.MAX_SAFE_INTEGER
  const ratio = quotaBytes > 0 ? usedBytes / quotaBytes : 0
  return { usedBytes, quotaBytes, ratio, warn: ratio >= STORAGE_QUOTA_WARN_RATIO }
}
