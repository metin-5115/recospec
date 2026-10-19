import { describe, it, expect, vi, beforeEach } from 'vitest'

const warn = vi.hoisted(() => vi.fn())
vi.mock('@shared/logger', () => ({
  logger: { warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { onBackgroundMessage } from './listen'

type Listener = (message: unknown, sender: object, respond: (r?: unknown) => void) => boolean

let listener: Listener

beforeEach(() => {
  warn.mockClear()
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      onMessage: {
        addListener: (fn: Listener) => {
          listener = fn
        },
        removeListener: vi.fn(),
      },
    },
  }
})

describe('listen', () => {
  it('hands a message with a string type to the handler', () => {
    const handler = vi.fn()
    onBackgroundMessage(handler)
    listener({ type: 'PING' }, { tab: { id: 1 } }, vi.fn())
    expect(handler).toHaveBeenCalledWith({ type: 'PING' }, { tab: { id: 1 } })
  })

  it.each([null, undefined, 'PING', 42, {}, { type: 3 }])(
    'refuses %j without calling the handler, and says so',
    (bad) => {
      const handler = vi.fn()
      onBackgroundMessage(handler)
      const respond = vi.fn()
      listener(bad, {}, respond)
      expect(handler).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledTimes(1)
      expect(respond).toHaveBeenCalledWith(undefined)
    },
  )

  it('logs a handler that rejects instead of swallowing it', async () => {
    onBackgroundMessage(async () => {
      throw new Error('boom')
    })
    listener({ type: 'PING' }, {}, vi.fn())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rejected'), expect.any(Error))
  })
})
