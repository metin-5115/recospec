import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import {
  createSession,
  getSession,
  updateSession,
  listSessionsByState,
  deleteSession,
} from './session-repo'
import { appendAction } from './action-repo'
import type { Session } from '@shared/types/session'
import type { RecordedAction } from '@shared/types/action'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: crypto.randomUUID(),
    name: 'Test Session',
    state: 'recording',
    startUrl: 'https://example.com',
    startedAt: Date.now(),
    metadata: {
      userAgent: 'test-agent',
      viewport: { width: 1280, height: 800 },
      timezone: 'UTC',
    },
    config: { captureClicks: true, captureInputs: true, captureNavigation: true },
    iterationNumber: 1,
    flowSignature: 'test-sig',
    ...overrides,
  }
}

function makeAction(sessionId: string, sequenceNumber: number): RecordedAction {
  return {
    actionId: crypto.randomUUID(),
    sessionId,
    sequenceNumber,
    type: 'click',
    timestamp: Date.now(),
    pageUrl: 'https://example.com',
  }
}

beforeEach(async () => {
  await db.sessions.clear()
  await db.actions.clear()
})

describe('session-repo', () => {
  it('createSession stores a session retrievable by getSession', async () => {
    const session = makeSession()
    await createSession(session)

    const found = await getSession(session.sessionId)
    expect(found).toBeDefined()
    expect(found!.sessionId).toBe(session.sessionId)
    expect(found!.name).toBe('Test Session')
  })

  it('getSession returns undefined for an unknown sessionId', async () => {
    const result = await getSession('non-existent-id')
    expect(result).toBeUndefined()
  })

  it('updateSession changes only the specified fields', async () => {
    const session = makeSession()
    await createSession(session)

    const stoppedAt = Date.now()
    await updateSession(session.sessionId, { state: 'stopped', stoppedAt })

    const updated = await getSession(session.sessionId)
    expect(updated!.state).toBe('stopped')
    expect(updated!.stoppedAt).toBe(stoppedAt)
    expect(updated!.name).toBe('Test Session')
  })

  it('listSessionsByState returns only sessions matching state', async () => {
    await createSession(makeSession({ state: 'recording' }))
    await createSession(makeSession({ state: 'stopped' }))
    await createSession(makeSession({ state: 'stopped' }))

    const recording = await listSessionsByState('recording')
    const stopped = await listSessionsByState('stopped')

    expect(recording).toHaveLength(1)
    expect(stopped).toHaveLength(2)
  })

  it('pause: updateSession transitions recording → paused', async () => {
    const session = makeSession({ state: 'recording' })
    await createSession(session)

    await updateSession(session.sessionId, { state: 'paused' })

    const updated = await getSession(session.sessionId)
    expect(updated!.state).toBe('paused')
    // other fields unchanged
    expect(updated!.name).toBe('Test Session')
  })

  it('resume: updateSession transitions paused → recording', async () => {
    const session = makeSession({ state: 'paused' })
    await createSession(session)

    await updateSession(session.sessionId, { state: 'recording' })

    const updated = await getSession(session.sessionId)
    expect(updated!.state).toBe('recording')
  })

  it('pause → resume cycle preserves name and startUrl', async () => {
    const session = makeSession({ state: 'recording' })
    await createSession(session)

    await updateSession(session.sessionId, { state: 'paused' })
    await updateSession(session.sessionId, { state: 'recording' })

    const updated = await getSession(session.sessionId)
    expect(updated!.state).toBe('recording')
    expect(updated!.name).toBe(session.name)
    expect(updated!.startUrl).toBe(session.startUrl)
  })

  it('deleteSession removes session and its actions from DB', async () => {
    const session = makeSession()
    await createSession(session)
    await appendAction(makeAction(session.sessionId, 0))
    await appendAction(makeAction(session.sessionId, 1))

    await deleteSession(session.sessionId)

    expect(await getSession(session.sessionId)).toBeUndefined()
    const remaining = await db.actions.where('sessionId').equals(session.sessionId).toArray()
    expect(remaining).toHaveLength(0)
  })

  it('deleteSession on non-existent id does not throw', async () => {
    await expect(deleteSession('no-such-id')).resolves.toBeUndefined()
  })
})
