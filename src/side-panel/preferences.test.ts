import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isBoolean, readPref, writePref } from './preferences'

const isMode = (v: unknown): v is 'a' | 'b' => v === 'a' || v === 'b'

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('readPref', () => {
  it('falls back when nothing is stored', () => {
    expect(readPref('k', isBoolean, true)).toBe(true)
  })

  it('reads JSON booleans written by older builds', () => {
    window.localStorage.setItem('k', 'false')
    expect(readPref('k', isBoolean, true)).toBe(false)
  })

  it('reads a bare string (the framework id was never JSON)', () => {
    window.localStorage.setItem('k', 'b')
    expect(readPref('k', isMode, 'a')).toBe('b')
  })

  it('falls back on a value the guard rejects', () => {
    window.localStorage.setItem('k', 'zzz')
    expect(readPref('k', isMode, 'a')).toBe('a')
  })

  it('falls back when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(readPref('k', isBoolean, true)).toBe(true)
  })
})

describe('writePref', () => {
  it('writes booleans and objects as JSON and strings as they are', () => {
    writePref('b', true)
    writePref('o', { x: 1 })
    writePref('s', 'cypress')
    expect(window.localStorage.getItem('b')).toBe('true')
    expect(window.localStorage.getItem('o')).toBe('{"x":1}')
    expect(window.localStorage.getItem('s')).toBe('cypress')
  })

  it('never throws when storage refuses the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => writePref('k', true)).not.toThrow()
  })
})
