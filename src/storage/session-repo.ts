import { db } from './db'
import type { Session, SessionState } from '@shared/types/session'

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
