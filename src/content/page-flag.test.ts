import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PAGE_FLAG_EVENT_NAME } from '@shared/constants'

const KEY = 'recospec:test-flag'

async function freshModule() {
  vi.resetModules()
  return import('./page-flag')
}

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('page-flag cache', () => {
  it('reads localStorage once, not on every request', async () => {
    window.localStorage.setItem(KEY, 'true')
    const { isPageFlagSet } = await freshModule()
    const spy = vi.spyOn(Storage.prototype, 'getItem')

    expect(isPageFlagSet(KEY)).toBe(true)
    expect(isPageFlagSet(KEY)).toBe(true)
    expect(isPageFlagSet(KEY)).toBe(true)

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('follows setPageFlag in the same world', async () => {
    const { isPageFlagSet, setPageFlag } = await freshModule()
    expect(isPageFlagSet(KEY)).toBe(false)
    setPageFlag(KEY, true)
    expect(isPageFlagSet(KEY)).toBe(true)
    setPageFlag(KEY, false)
    expect(isPageFlagSet(KEY)).toBe(false)
  })

  it('learns about a change made by the other world through the flag event', async () => {
    // The MAIN-world proxy has its own copy of this module; the content script announces changes.
    const proxySide = await freshModule()
    expect(proxySide.isPageFlagSet(KEY)).toBe(false)

    window.dispatchEvent(new CustomEvent(PAGE_FLAG_EVENT_NAME, { detail: { key: KEY, on: true } }))
    expect(proxySide.isPageFlagSet(KEY)).toBe(true)
  })

  it('announces what it sets', async () => {
    const { setPageFlag } = await freshModule()
    const seen: Array<{ key: string; on: boolean }> = []
    window.addEventListener(PAGE_FLAG_EVENT_NAME, (e) =>
      seen.push((e as CustomEvent<{ key: string; on: boolean }>).detail),
    )
    setPageFlag(KEY, true)
    expect(seen).toContainEqual({ key: KEY, on: true })
  })

  it('is off when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const { isPageFlagSet } = await freshModule()
    expect(isPageFlagSet(KEY)).toBe(false)
  })
})
