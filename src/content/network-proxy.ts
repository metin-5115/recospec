/**
 * Runs in the MAIN world (page's JS context) so it can wrap window.fetch and
 * XMLHttpRequest as the page sees them. Captured request/response metadata is
 * relayed to the ISOLATED-world content script via a CustomEvent.
 *
 * Request bodies are deliberately NOT captured: they routinely carry credentials (a login POST
 * holds the typed password) and nothing consumes them — mocks only need the response.
 *
 * The proxy is inert unless a recording is active (page flag set by the ISOLATED content
 * script, read per request), and it never delays the page: the response is returned as soon
 * as headers arrive while the body clone is read in a detached task, capped in bytes.
 *
 * No new permissions required — the second content_scripts entry in
 * manifest.json with `"world": "MAIN"` is what gets us here.
 */
import {
  NETWORK_BODY_MAX_BYTES,
  NETWORK_BODY_SKIP_CONTENT_TYPES,
  NETWORK_CAPTURE_EVENT_NAME,
  NETWORK_CAPTURE_FLAG_KEY,
  NETWORK_URL_BLOCKLIST,
} from '@shared/constants'
import { isPageFlagSet } from './page-flag'

interface NetworkDetail {
  method: string
  url: string
  status?: number
  contentType?: string
  responseBody?: string
  durationMs?: number
}

function shouldSkip(url: string): boolean {
  return NETWORK_URL_BLOCKLIST.some((p) => url.startsWith(p))
}

function truncate(s: string): string {
  return s.length > NETWORK_BODY_MAX_BYTES ? s.slice(0, NETWORK_BODY_MAX_BYTES) : s
}

function isRecording(): boolean {
  return isPageFlagSet(NETWORK_CAPTURE_FLAG_KEY)
}

/** Streams and binary payloads are never worth (or safe) buffering as text. */
function isBodyCapturable(contentType: string | undefined): boolean {
  const type = contentType?.toLowerCase() ?? ''
  return !NETWORK_BODY_SKIP_CONTENT_TYPES.some((p) => type.startsWith(p))
}

/**
 * Reads at most NETWORK_BODY_MAX_BYTES of `body` as UTF-8, then cancels the reader so a
 * large or endless response is never buffered. A trailing partial multi-byte sequence is
 * dropped rather than turned into a replacement character.
 */
async function readCapped(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0
  try {
    while (bytes < NETWORK_BODY_MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      const room = NETWORK_BODY_MAX_BYTES - bytes
      const chunk = value.byteLength > room ? value.subarray(0, room) : value
      bytes += chunk.byteLength
      text += decoder.decode(chunk, { stream: true })
    }
  } finally {
    // Not awaited: a tee'd branch's cancel() only settles once the page's branch is also
    // cancelled or finished, which would stall this task for as long as the page reads.
    reader.cancel().catch(() => undefined)
  }
  return text
}

function dispatch(detail: NetworkDetail): void {
  try {
    window.dispatchEvent(new CustomEvent(NETWORK_CAPTURE_EVENT_NAME, { detail }))
  } catch {
    // ignore — proxy failures must never break the page
  }
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

  if (shouldSkip(url) || !isRecording()) return originalFetch(input, init)

  let response: Response
  try {
    response = await originalFetch(input, init)
  } catch (err) {
    dispatch({
      method,
      url,
      durationMs: performance.now() - startedAt,
    })
    throw err
  }

  const contentType = response.headers.get('content-type') ?? undefined
  const report = (responseBody?: string): void =>
    dispatch({
      method,
      url,
      status: response.status,
      contentType,
      responseBody,
      durationMs: performance.now() - startedAt,
    })

  if (!response.body || !isBodyCapturable(contentType)) {
    report()
    return response
  }

  // Clone before reading so the page's downstream consumers still see the body, then read
  // the clone in a detached task: the page gets its response as soon as headers arrive.
  const body = response.clone().body
  if (!body) {
    report()
    return response
  }
  readCapped(body)
    .then((text) => report(text))
    .catch(() => report())
  return response
}

// ---------------------------------------------------------------------------
// XMLHttpRequest wrapper
// ---------------------------------------------------------------------------

interface PatchedXhr extends XMLHttpRequest {
  __pf_method?: string
  __pf_url?: string
  __pf_started?: number
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

  if (!isRecording()) return originalSend.call(this, body)

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
      durationMs: this.__pf_started ? performance.now() - this.__pf_started : undefined,
    })
  })
  return originalSend.call(this, body)
} as XMLHttpRequest['send']
