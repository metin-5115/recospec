import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'

const listSessions = vi.hoisted(() => vi.fn())
const getSessionWithActions = vi.hoisted(() => vi.fn())
const flushNetworkBatch = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('@storage/session-repo', () => ({ listSessions, getSessionWithActions }))
vi.mock('./event-aggregator', () => ({ flushNetworkBatch }))

import { handleExportRequest } from './export-handler'

const session = (id: string, state: Session['state']): Session => ({
  sessionId: id,
  name: id,
  state,
  startUrl: 'https://example.com',
  startedAt: 0,
  metadata: { userAgent: 'x', viewport: { width: 0, height: 0 }, timezone: 'UTC' },
  config: { captureClicks: true, captureInputs: true, captureNavigation: true },
  iterationNumber: 1,
  flowSignature: 'sig',
})

const action: RecordedAction = {
  actionId: 'a1',
  sessionId: 's-stopped',
  sequenceNumber: 0,
  type: 'click',
  timestamp: 0,
  pageUrl: 'https://example.com',
}

beforeEach(() => {
  listSessions.mockReset()
  getSessionWithActions.mockReset()
  flushNetworkBatch.mockClear()
})

describe('handleExportRequest', () => {
  it('exports the most recent stopped session when no id is given', async () => {
    listSessions.mockResolvedValue([
      session('s-live', 'recording'),
      session('s-stopped', 'stopped'),
    ])
    getSessionWithActions.mockResolvedValue({
      session: session('s-stopped', 'stopped'),
      actions: [action],
    })

    const payload = await handleExportRequest()

    expect(getSessionWithActions).toHaveBeenCalledWith('s-stopped')
    expect(payload?.session.sessionId).toBe('s-stopped')
    expect(payload?.actions).toHaveLength(1)
  })

  it('falls back to the newest session when none has been stopped', async () => {
    listSessions.mockResolvedValue([session('s-live', 'recording')])
    getSessionWithActions.mockResolvedValue({
      session: session('s-live', 'recording'),
      actions: [action],
    })
    await handleExportRequest()
    expect(getSessionWithActions).toHaveBeenCalledWith('s-live')
  })

  it('exports the requested session', async () => {
    getSessionWithActions.mockResolvedValue({
      session: session('s-x', 'stopped'),
      actions: [action],
    })
    await handleExportRequest('s-x')
    expect(listSessions).not.toHaveBeenCalled()
    expect(getSessionWithActions).toHaveBeenCalledWith('s-x')
  })

  it('writes pending network calls before reading the session', async () => {
    getSessionWithActions.mockResolvedValue({
      session: session('s-x', 'stopped'),
      actions: [action],
    })
    await handleExportRequest('s-x')
    expect(flushNetworkBatch).toHaveBeenCalledBefore(getSessionWithActions)
  })

  it('returns null when there is nothing recorded', async () => {
    listSessions.mockResolvedValue([])
    expect(await handleExportRequest()).toBeNull()

    getSessionWithActions.mockResolvedValue(undefined)
    expect(await handleExportRequest('missing')).toBeNull()

    getSessionWithActions.mockResolvedValue({ session: session('s-empty', 'stopped'), actions: [] })
    expect(await handleExportRequest('s-empty')).toBeNull()
  })
})
