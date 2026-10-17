import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NETWORK_BODY_MAX_BYTES, NETWORK_CAPTURE_EVENT_NAME } from '@shared/constants'

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
    expect(events).toHaveLength(1)
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
    expect(events[0].method).toBe('GET')
  })

  it('takes the url and method from a Request object', async () => {
    await installProxy()
    await window.fetch(new Request('https://api.test/r', { method: 'DELETE' }))
    expect(events[0]).toMatchObject({ method: 'DELETE', url: 'https://api.test/r' })
  })

  it('truncates oversized bodies to the capture cap', async () => {
    baseFetch.mockResolvedValue(new Response('x'.repeat(NETWORK_BODY_MAX_BYTES + 500)))
    await installProxy()
    await window.fetch('https://api.test/big')
    expect(events[0].responseBody).toHaveLength(NETWORK_BODY_MAX_BYTES)
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
