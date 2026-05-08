/**
 * Runs in the MAIN world (page's JS context) so it can wrap window.fetch and
 * XMLHttpRequest as the page sees them. Captured request/response metadata is
 * relayed to the ISOLATED-world content script via a CustomEvent.
 *
 * No new permissions required — the second content_scripts entry in
 * manifest.json with `"world": "MAIN"` is what gets us here.
 */
const EVENT_NAME = 'playforge:network'
const MAX_BYTES = 50_000
const BLOCKED_PATTERNS = ['chrome-extension://', 'moz-extension://']

interface NetworkDetail {
  method: string
  url: string
  status?: number
  contentType?: string
  responseBody?: string
  requestBody?: string
  durationMs?: number
}

function shouldSkip(url: string): boolean {
  return BLOCKED_PATTERNS.some((p) => url.startsWith(p))
}

function truncate(s: string): string {
  return s.length > MAX_BYTES ? s.slice(0, MAX_BYTES) : s
}

function dispatch(detail: NetworkDetail): void {
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }))
  } catch {
    // ignore — proxy failures must never break the page
  }
}

function safeStringify(body: BodyInit | null | undefined): string | undefined {
  if (body == null) return undefined
  if (typeof body === 'string') return truncate(body)
  if (body instanceof URLSearchParams || body instanceof FormData) return body.toString()
  return undefined
}

// ---------------------------------------------------------------------------
// fetch wrapper
// ---------------------------------------------------------------------------

const originalFetch = window.fetch.bind(window)

window.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const startedAt = performance.now()
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()

  if (shouldSkip(url)) return originalFetch(input, init)

  let response: Response
  try {
    response = await originalFetch(input, init)
  } catch (err) {
    dispatch({
      method,
      url,
      durationMs: performance.now() - startedAt,
      requestBody: safeStringify(init?.body as BodyInit),
    })
    throw err
  }

  // Clone before reading so the page's downstream consumers still see the body.
  const cloned = response.clone()
  const contentType = cloned.headers.get('content-type') ?? undefined
  let responseBody: string | undefined
  try {
    responseBody = truncate(await cloned.text())
  } catch {
    responseBody = undefined
  }

  dispatch({
    method,
    url,
    status: response.status,
    contentType,
    responseBody,
    requestBody: safeStringify(init?.body as BodyInit),
    durationMs: performance.now() - startedAt,
  })
  return response
}

// ---------------------------------------------------------------------------
// XMLHttpRequest wrapper
// ---------------------------------------------------------------------------

interface PatchedXhr extends XMLHttpRequest {
  __pf_method?: string
  __pf_url?: string
  __pf_started?: number
  __pf_requestBody?: string
}

const originalOpen = XMLHttpRequest.prototype.open
const originalSend = XMLHttpRequest.prototype.send

XMLHttpRequest.prototype.open = function patchedOpen(
  this: PatchedXhr,
  method: string,
  url: string | URL,
  ...rest: unknown[]
) {
  this.__pf_method = method.toUpperCase()
  this.__pf_url = typeof url === 'string' ? url : url.toString()
  // Forward to the real open with whatever optional args were supplied.
  return (originalOpen as unknown as (...args: unknown[]) => void).call(this, method, url, ...rest)
} as XMLHttpRequest['open']

XMLHttpRequest.prototype.send = function patchedSend(
  this: PatchedXhr,
  body?: Document | XMLHttpRequestBodyInit | null,
) {
  this.__pf_started = performance.now()
  if (typeof body === 'string') this.__pf_requestBody = truncate(body)

  this.addEventListener('loadend', () => {
    const url = this.__pf_url ?? ''
    if (!url || shouldSkip(url)) return
    let responseBody: string | undefined
    try {
      const rt = this.responseType
      if (rt === '' || rt === 'text') responseBody = truncate(String(this.responseText ?? ''))
      else if (rt === 'json' && this.response != null) {
        responseBody = truncate(JSON.stringify(this.response))
      }
    } catch {
      responseBody = undefined
    }
    const contentType = this.getResponseHeader('content-type') ?? undefined
    dispatch({
      method: this.__pf_method ?? 'GET',
      url,
      status: this.status,
      contentType,
      responseBody,
      requestBody: this.__pf_requestBody,
      durationMs: this.__pf_started ? performance.now() - this.__pf_started : undefined,
    })
  })
  return originalSend.call(this, body)
} as XMLHttpRequest['send']
