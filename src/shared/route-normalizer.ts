const NUMERIC_SEGMENT = /^\d+$/
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HASH_SEGMENT = /^[0-9a-f]{24,}$/i

/** The route of a page URL with its dynamic segments replaced (`/orders/42` → `/orders/:id`). */
export function normalizeUrl(rawUrl: string): string {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return rawUrl
  }

  if (url.protocol === 'file:') {
    const filename = url.pathname.split('/').pop() ?? 'page'
    return '/' + filename.replace(/\.[^.]+$/, '')
  }

  // Strip query string and fragment — only use pathname
  const segments = url.pathname.split('/').map((seg) => {
    if (NUMERIC_SEGMENT.test(seg)) return ':id'
    if (UUID_SEGMENT.test(seg)) return ':uuid'
    if (HASH_SEGMENT.test(seg)) return ':id'
    return seg
  })

  // Remove trailing empty segment (e.g. '/users/' → '/users')
  if (segments.length > 1 && segments[segments.length - 1] === '') {
    segments.pop()
  }

  return segments.join('/')
}
