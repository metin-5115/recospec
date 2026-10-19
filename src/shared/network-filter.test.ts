import { describe, it, expect } from 'vitest'
import { isRecordableNetworkCall } from './network-filter'

const ORIGIN = 'https://shop.test'

describe('isRecordableNetworkCall', () => {
  it('keeps same-origin calls that got a response', () => {
    expect(
      isRecordableNetworkCall({ url: 'https://shop.test/api/cart', status: 200 }, ORIGIN),
    ).toBe(true)
    expect(isRecordableNetworkCall({ url: '/api/cart', status: 404 }, ORIGIN)).toBe(true)
  })

  it('drops third-party calls', () => {
    expect(
      isRecordableNetworkCall({ url: 'https://analytics.example/collect', status: 204 }, ORIGIN),
    ).toBe(false)
  })

  it('drops calls without a real status (failed or opaque)', () => {
    expect(isRecordableNetworkCall({ url: '/api/cart' }, ORIGIN)).toBe(false)
    expect(isRecordableNetworkCall({ url: '/api/cart', status: 0 }, ORIGIN)).toBe(false)
  })

  it('does not match a look-alike origin', () => {
    expect(
      isRecordableNetworkCall({ url: 'https://shop.test.evil.example/x', status: 200 }, ORIGIN),
    ).toBe(false)
  })

  it('accepts any origin when there is no base to compare with', () => {
    expect(isRecordableNetworkCall({ url: 'https://a.test/x', status: 200 }, '')).toBe(true)
  })
})
