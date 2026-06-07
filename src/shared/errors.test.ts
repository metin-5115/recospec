import { describe, it, expect } from 'vitest'
import {
  ContentScriptMissingError,
  IndexedDBQuotaError,
  RecospecError,
  ServiceWorkerColdError,
  isPortDisconnectedError,
  isQuotaExceededError,
} from './errors'

describe('RecospecError subclasses', () => {
  it('ServiceWorkerColdError carries the typed contract', () => {
    const err = new ServiceWorkerColdError()
    expect(err).toBeInstanceOf(RecospecError)
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('SERVICE_WORKER_COLD')
    expect(err.recoveryAction).toBe('retry-service-worker')
    expect(err.name).toBe('ServiceWorkerColdError')
    expect(err.userMessage).toMatch(/wake/i)
  })

  it('IndexedDBQuotaError carries the typed contract', () => {
    const err = new IndexedDBQuotaError()
    expect(err).toBeInstanceOf(RecospecError)
    expect(err.code).toBe('INDEXEDDB_QUOTA')
    expect(err.recoveryAction).toBe('navigate-history')
    expect(err.name).toBe('IndexedDBQuotaError')
    expect(err.userMessage).toMatch(/full/i)
  })

  it('ContentScriptMissingError preserves the tabId for recovery', () => {
    const err = new ContentScriptMissingError(42)
    expect(err).toBeInstanceOf(RecospecError)
    expect(err.code).toBe('CONTENT_SCRIPT_MISSING')
    expect(err.recoveryAction).toBe('reload-tab')
    expect(err.tabId).toBe(42)
    expect(err.message).toContain('42')
  })

  it('preserves the underlying cause when one is provided', () => {
    const cause = new Error('quota: 100MB')
    const err = new IndexedDBQuotaError(cause)
    expect(err.cause).toBe(cause)
  })
})

describe('isQuotaExceededError', () => {
  it('matches a plain DOMException-shaped error', () => {
    expect(isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true)
  })

  it('matches a Dexie wrapper that exposes inner.name', () => {
    expect(
      isQuotaExceededError({
        name: 'AbortError',
        inner: { name: 'QuotaExceededError' },
      }),
    ).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isQuotaExceededError(new Error('boom'))).toBe(false)
    expect(isQuotaExceededError(null)).toBe(false)
    expect(isQuotaExceededError('quota')).toBe(false)
  })
})

describe('isPortDisconnectedError', () => {
  it('recognizes Chrome cold-SW reject phrasing', () => {
    expect(
      isPortDisconnectedError(
        new Error('Could not establish connection. Receiving end does not exist.'),
      ),
    ).toBe(true)
    expect(isPortDisconnectedError(new Error('The message port closed before a response.'))).toBe(
      true,
    )
  })

  it('ignores unrelated errors', () => {
    expect(isPortDisconnectedError(new Error('TypeError: foo'))).toBe(false)
    expect(isPortDisconnectedError(undefined)).toBe(false)
  })
})
