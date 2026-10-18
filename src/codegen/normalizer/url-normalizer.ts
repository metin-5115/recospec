const NUMERIC_SEGMENT = /^\d+$/
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HASH_SEGMENT = /^[0-9a-f]{24,}$/i

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

/**
 * First path segment of a localised site (`tr-tr`, `en-US`, `pt_BR`). Language codes are listed
 * explicitly: a bare `xx-yy` pattern would also swallow routes such as `to-do` or `my-id`.
 */
const LOCALE_SEGMENT =
  /^(tr|en|de|fr|es|it|pt|nl|ru|ja|ko|zh|ar|pl|sv|da|fi|nb|cs|el|he|hu|ro|uk|th|vi)[-_][A-Za-z]{2}$/

export function urlToPageName(normalizedPath: string): string {
  const segments = normalizedPath.replace(/^\//, '').split('/')
  if (segments[0] !== undefined && LOCALE_SEGMENT.test(segments[0])) segments.shift()
  const clean = segments.join('-').replace(/[^a-zA-Z0-9-]/g, '')
  if (!clean || clean === '') return 'Home'
  return clean
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}
