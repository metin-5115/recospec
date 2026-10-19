import { describe, it, expect, vi, afterEach } from 'vitest'
import { logger } from './logger'

describe('logger.redact', () => {
  it('keeps name, message and stack of an Error', () => {
    const err = new TypeError('boom')
    expect(logger.redact(err)).toEqual({ name: 'TypeError', message: 'boom', stack: err.stack })
  })

  it('serializes an Error nested in an object', () => {
    const out = logger.redact({ cause: new Error('inner') }) as { cause: { message: string } }
    expect(out.cause.message).toBe('inner')
  })

  it('still masks sensitive keys', () => {
    expect(logger.redact({ password: 'x', user: 'u' })).toEqual({ password: '***', user: 'u' })
  })
})

describe('logger.error', () => {
  afterEach(() => vi.restoreAllMocks())

  it('forwards the Error message to the console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logger.error('failed', new Error('boom'))
    const forwarded = spy.mock.calls[0]?.[2] as { message: string }
    expect(forwarded.message).toBe('boom')
  })
})
