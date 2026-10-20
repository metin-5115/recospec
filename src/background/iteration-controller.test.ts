import { describe, it, expect, vi, beforeEach } from 'vitest'
import { installChromeMock, type ChromeMock } from '../test-utils/chrome-mock'
import type { Session } from '@shared/types/session'

const linkIteration = vi.hoisted(() => vi.fn())
vi.mock('@storage/session-repo', () => ({ linkIteration }))

import { handleIterationAccept, handleIterationDismiss } from './iteration-controller'

let chromeMock: ChromeMock

beforeEach(() => {
  chromeMock = installChromeMock()
  linkIteration.mockReset()
})

describe('handleIterationAccept', () => {
  it('links the session and tells the side panel about the updated row', async () => {
    const linked = { sessionId: 's2', iterationNumber: 2 } as Session
    linkIteration.mockResolvedValue(linked)

    await handleIterationAccept('s2', 's1')

    expect(linkIteration).toHaveBeenCalledWith('s2', 's1')
    expect(chromeMock.runtimeSendMessage).toHaveBeenCalledWith({
      type: 'SESSION_STATE_CHANGED',
      session: linked,
    })
  })

  it('stays quiet when the session or its parent no longer exists', async () => {
    linkIteration.mockResolvedValue(undefined)
    await handleIterationAccept('s2', 'gone')
    expect(chromeMock.runtimeSendMessage).not.toHaveBeenCalled()
  })
})

describe('handleIterationDismiss', () => {
  it('has no effect on the backend', async () => {
    await expect(handleIterationDismiss('s2')).resolves.toBeUndefined()
    expect(linkIteration).not.toHaveBeenCalled()
  })
})
