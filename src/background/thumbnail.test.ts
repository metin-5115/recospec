import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { THUMBNAIL_MAX_EDGE_PX, THUMBNAIL_PADDING_PX } from '@shared/constants'
import { captureElementThumbnail } from './thumbnail'

const CAPTURED = 'data:image/jpeg;base64,AAAA'

interface DrawCall {
  args: number[]
}

let draws: DrawCall[]
let canvasSize: { width: number; height: number } | null
let captureCalls: unknown[]

class FakeOffscreenCanvas {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    canvasSize = { width, height }
  }
  getContext() {
    return {
      drawImage: (_image: unknown, ...args: number[]) => draws.push({ args }),
    }
  }
  async convertToBlob(options: { type: string }) {
    return new Blob([new Uint8Array([1, 2, 3])], { type: options.type })
  }
}

beforeEach(() => {
  draws = []
  canvasSize = null
  captureCalls = []
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    tabs: {
      captureVisibleTab: vi.fn(async (options: unknown) => {
        captureCalls.push(options)
        return CAPTURED
      }),
    },
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ blob: async () => new Blob(['x']) })),
  )
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 2000, height: 1000, close: vi.fn() })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('captureElementThumbnail', () => {
  it('asks the browser for a compressed JPEG, not a PNG', async () => {
    await captureElementThumbnail(undefined)
    expect(captureCalls[0]).toMatchObject({ format: 'jpeg' })
  })

  it('returns the capture untouched when the element position is unknown', async () => {
    expect(await captureElementThumbnail(undefined)).toBe(CAPTURED)
    expect(canvasSize).toBeNull()
  })

  it('crops to the element (plus padding), in device pixels', async () => {
    const result = await captureElementThumbnail({
      x: 100,
      y: 50,
      width: 200,
      height: 80,
      devicePixelRatio: 2,
    })
    const pad = THUMBNAIL_PADDING_PX * 2
    expect(draws).toHaveLength(1)
    const [sx, sy, sw, sh] = draws[0]!.args
    expect([sx, sy]).toEqual([200 - pad, 100 - pad])
    expect([sw, sh]).toEqual([400 + 2 * pad, 160 + 2 * pad])
    expect(result).toMatch(/^data:image\/jpeg;base64,/)
    expect(result).not.toBe(CAPTURED)
  })

  it('never makes the thumbnail larger than the cap', async () => {
    await captureElementThumbnail({ x: 0, y: 0, width: 1800, height: 900, devicePixelRatio: 1 })
    expect(Math.max(canvasSize!.width, canvasSize!.height)).toBeLessThanOrEqual(
      THUMBNAIL_MAX_EDGE_PX,
    )
  })

  it('clamps the crop to the screenshot', async () => {
    await captureElementThumbnail({ x: 1900, y: 950, width: 400, height: 400, devicePixelRatio: 1 })
    const [sx, sy, sw, sh] = draws[0]!.args
    expect(sx! + sw!).toBeLessThanOrEqual(2000)
    expect(sy! + sh!).toBeLessThanOrEqual(1000)
  })

  it('gives up quietly when the tab cannot be captured', async () => {
    ;(
      globalThis as unknown as { chrome: { tabs: { captureVisibleTab: unknown } } }
    ).chrome.tabs.captureVisibleTab = vi.fn(async () => {
      throw new Error('no permission')
    })
    expect(await captureElementThumbnail(undefined)).toBeUndefined()
  })

  it('falls back to the uncropped capture when cropping fails', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode failed')
      }),
    )
    const rect = { x: 1, y: 1, width: 10, height: 10, devicePixelRatio: 1 }
    expect(await captureElementThumbnail(rect)).toBe(CAPTURED)
  })
})
