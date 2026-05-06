import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { createSession, getSession, updateSession, listSessionsByState } from './session-repo'
import type { Session } from '@shared/types/session'

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
    ...overrides,
  }
}

beforeEach(async () => {
  await db.sessions.clear()
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
})
