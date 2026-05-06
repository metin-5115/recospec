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

  const segments = url.pathname.split('/').map((seg) => {
    if (NUMERIC_SEGMENT.test(seg)) return ':id'
    if (UUID_SEGMENT.test(seg)) return ':id'
    if (HASH_SEGMENT.test(seg)) return ':id'
    return seg
  })

  return segments.join('/')
}

export function urlToPageName(normalizedPath: string): string {
  const clean = normalizedPath
    .replace(/^\//, '')
    .replace(/\//g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
  if (!clean || clean === '') return 'Home'
  return clean
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}
