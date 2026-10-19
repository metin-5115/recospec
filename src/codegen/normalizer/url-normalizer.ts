export { normalizeUrl } from '@shared/route-normalizer'

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
