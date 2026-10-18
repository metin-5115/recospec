import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  NETWORK_BODY_MAX_BYTES,
  NETWORK_CAPTURE_EVENT_NAME,
  NETWORK_CAPTURE_FLAG_KEY,
} from '@shared/constants'

interface CapturedDetail {
  method: string
  url: string
  status?: number
  contentType?: string
  responseBody?: string
  durationMs?: number
}

const originalOpen = XMLHttpRequest.prototype.open
const originalSend = XMLHttpRequest.prototype.send
const originalFetch = window.fetch

let events: CapturedDetail[]
let listener: (e: Event) => void
let baseFetch: ReturnType<typeof vi.fn>

/** Fresh import so the proxy wraps whatever `window.fetch` currently is. */
async function installProxy(): Promise<void> {
  vi.resetModules()
  await import('./network-proxy')
}

beforeEach(() => {
  window.localStorage.setItem(NETWORK_CAPTURE_FLAG_KEY, 'true')
  events = []
  listener = (e) => events.push((e as CustomEvent<CapturedDetail>).detail)
  window.addEventListener(NETWORK_CAPTURE_EVENT_NAME, listener)
  baseFetch = vi.fn(
    async () =>
      new Response('{"ok":true}', {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
  )
  window.fetch = baseFetch as unknown as typeof window.fetch
})

afterEach(() => {
  window.localStorage.clear()
  window.removeEventListener(NETWORK_CAPTURE_EVENT_NAME, listener)
  window.fetch = originalFetch
  XMLHttpRequest.prototype.open = originalOpen
  XMLHttpRequest.prototype.send = originalSend
})

describe('network-proxy — fetch', () => {
  it('reports method, url, status, content type and bodies', async () => {
    await installProxy()

    const res = await window.fetch('https://api.test/items', {
      method: 'post',
      body: '{"name":"a"}',
    })

    expect(res.status).toBe(201)
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.test/items',
      status: 201,
      contentType: 'application/json',
      responseBody: '{"ok":true}',
    })
    expect(events[0]).not.toHaveProperty('requestBody')
    expect(events[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('leaves the response body readable for the page', async () => {
    await installProxy()
    const res = await window.fetch('https://api.test/items')
    expect(await res.text()).toBe('{"ok":true}')
  })

  it('defaults to GET', async () => {
    await installProxy()
    await window.fetch('https://api.test/items')
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0].method).toBe('GET')
  })

  it('takes the url and method from a Request object', async () => {
    await installProxy()
    await window.fetch(new Request('https://api.test/r', { method: 'DELETE' }))
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]).toMatchObject({ method: 'DELETE', url: 'https://api.test/r' })
  })

  it('truncates oversized bodies to the capture cap', async () => {
    baseFetch.mockResolvedValue(new Response('x'.repeat(NETWORK_BODY_MAX_BYTES + 500)))
    await installProxy()
    await window.fetch('https://api.test/big')
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0].responseBody).toHaveLength(NETWORK_BODY_MAX_BYTES)
  })

  it('caps the captured body in bytes, not characters', async () => {
    baseFetch.mockResolvedValue(new Response('é'.repeat(NETWORK_BODY_MAX_BYTES)))
    await installProxy()
    await window.fetch('https://api.test/multibyte')
    await vi.waitFor(() => expect(events).toHaveLength(1))
    const bytes = new TextEncoder().encode(events[0].responseBody ?? '').length
    expect(bytes).toBeLessThanOrEqual(NETWORK_BODY_MAX_BYTES)
    expect(bytes).toBeGreaterThan(NETWORK_BODY_MAX_BYTES - 4)
    expect(events[0].responseBody).not.toContain('�')
  })

  it('returns the response before the body has finished downloading', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('first-chunk'))
        // Never closed: an SSE / LLM stream that outlives the test.
      },
    })
    baseFetch.mockResolvedValue(
      new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } }),
    )
    await installProxy()

    const res = await Promise.race([
      window.fetch('https://api.test/stream'),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 200)),
    ])

    expect(res).not.toBe('timeout')
    expect((res as Response).status).toBe(200)
    expect(events).toHaveLength(0)
    // Not awaited: a tee'd branch settles its cancel only when the capture branch ends too.
    ;(res as Response).body?.cancel().catch(() => undefined)
  })

  it('stops reading the clone once the cap is reached', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(10_000))
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(chunk)
      },
    })
    baseFetch.mockResolvedValue(new Response(stream))
    await installProxy()

    const res = await window.fetch('https://api.test/endless')
    await vi.waitFor(() => expect(events).toHaveLength(1))

    expect(events[0].responseBody).toHaveLength(NETWORK_BODY_MAX_BYTES)
    expect(pulled).toBeLessThan(20)
    res.body?.cancel().catch(() => undefined)
  })

  it('keeps the page-visible body intact when capture truncates', async () => {
    baseFetch.mockResolvedValue(new Response('y'.repeat(NETWORK_BODY_MAX_BYTES * 2)))
    await installProxy()
    const res = await window.fetch('https://api.test/big')
    expect((await res.text()).length).toBe(NETWORK_BODY_MAX_BYTES * 2)
  })

  it.each([
    'text/event-stream',
    'text/event-stream; charset=utf-8',
    'image/png',
    'application/pdf',
  ])(
    'does not read the body of %s responses but still reports the request',
    async (contentType) => {
      const response = new Response('data: x\n\n', { headers: { 'content-type': contentType } })
      const clone = vi.spyOn(response, 'clone')
      baseFetch.mockResolvedValue(response)
      await installProxy()

      const res = await window.fetch('https://api.test/skip')

      expect(res).toBe(response)
      expect(clone).not.toHaveBeenCalled()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ status: 200, contentType })
      expect(events[0].responseBody).toBeUndefined()
    },
  )

  it('reports no body, and no unhandled rejection, when the body stream errors', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('boom'))
      },
    })
    baseFetch.mockResolvedValue(new Response(stream))
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    await installProxy()

    const res = await window.fetch('https://api.test/broken')
    expect(res.status).toBe(200)
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0].responseBody).toBeUndefined()
    await new Promise((r) => setTimeout(r, 0))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('is inert when no recording is active: the original response is returned untouched', async () => {
    window.localStorage.removeItem(NETWORK_CAPTURE_FLAG_KEY)
    const response = new Response('{"ok":true}')
    const clone = vi.spyOn(response, 'clone')
    baseFetch.mockResolvedValue(response)
    await installProxy()

    const res = await window.fetch('https://api.test/items')

    expect(res).toBe(response)
    expect(clone).not.toHaveBeenCalled()
    await new Promise((r) => setTimeout(r, 0))
    expect(events).toHaveLength(0)
  })

  it('does not report failures either when no recording is active', async () => {
    window.localStorage.removeItem(NETWORK_CAPTURE_FLAG_KEY)
    baseFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    await installProxy()
    await expect(window.fetch('https://api.test/down')).rejects.toThrow('Failed to fetch')
    expect(events).toHaveLength(0)
  })

  it('reads the flag per request, so start/stop toggles without a reload', async () => {
    window.localStorage.removeItem(NETWORK_CAPTURE_FLAG_KEY)
    await installProxy()
    await window.fetch('https://api.test/a')
    window.localStorage.setItem(NETWORK_CAPTURE_FLAG_KEY, 'true')
    await window.fetch('https://api.test/b')
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0].url).toBe('https://api.test/b')
  })

  it('does not capture extension-internal urls but still performs the request', async () => {
    await installProxy()
    await window.fetch('chrome-extension://abc/popup.html')
    expect(baseFetch).toHaveBeenCalledTimes(1)
    expect(events).toHaveLength(0)
  })

  it('records a network failure without a status and rethrows to the page', async () => {
    baseFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    await installProxy()

    await expect(window.fetch('https://api.test/down')).rejects.toThrow('Failed to fetch')

    expect(events).toHaveLength(1)
    expect(events[0].status).toBeUndefined()
    expect(events[0].url).toBe('https://api.test/down')
  })

  it('never captures request bodies — they carry credentials and nothing consumes them', async () => {
    await installProxy()
    await window.fetch('https://api.test/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com', password: 'hunter2-test' }),
    })
    await window.fetch('https://api.test/blob', { method: 'POST', body: new Blob(['x']) })
    for (const event of events) {
      expect(event).not.toHaveProperty('requestBody')
      expect(JSON.stringify(event)).not.toContain('hunter2-test')
    }
  })
})

describe('network-proxy — XMLHttpRequest', () => {
  it('reports a completed request on loadend', async () => {
    // Stand in for the network: the proxy only needs `loadend` to fire.
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest): void {
      queueMicrotask(() => this.dispatchEvent(new Event('loadend')))
    }
    await installProxy()

    const xhr = new XMLHttpRequest()
    xhr.open('post', 'https://api.test/xhr')
    Object.defineProperty(xhr, 'status', { value: 200 })
    Object.defineProperty(xhr, 'responseText', { value: 'pong' })
    vi.spyOn(xhr, 'getResponseHeader').mockReturnValue('text/plain')
    const done = new Promise<void>((resolve) => xhr.addEventListener('loadend', () => resolve()))
    xhr.send('a=1')
    await done

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.test/xhr',
      status: 200,
      contentType: 'text/plain',
      responseBody: 'pong',
    })
    expect(events[0]).not.toHaveProperty('requestBody')
  })

  it('does not report anything when no recording is active', async () => {
    window.localStorage.removeItem(NETWORK_CAPTURE_FLAG_KEY)
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest): void {
      queueMicrotask(() => this.dispatchEvent(new Event('loadend')))
    }
    await installProxy()

    const xhr = new XMLHttpRequest()
    xhr.open('GET', 'https://api.test/xhr')
    const done = new Promise<void>((resolve) => xhr.addEventListener('loadend', () => resolve()))
    xhr.send()
    await done

    expect(events).toHaveLength(0)
  })

  it('skips extension-internal urls', async () => {
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest): void {
      queueMicrotask(() => this.dispatchEvent(new Event('loadend')))
    }
    await installProxy()

    const xhr = new XMLHttpRequest()
    xhr.open('GET', 'chrome-extension://abc/x')
    const done = new Promise<void>((resolve) => xhr.addEventListener('loadend', () => resolve()))
    xhr.send()
    await done

    expect(events).toHaveLength(0)
  })
})
