import {
  DYNAMIC_ROUTE_SEGMENT_PATTERN,
  DYNAMIC_ROUTE_SEGMENT_REGEX_SOURCE,
  URL_PATH_END_REGEX_SOURCE,
} from '@shared/constants'

/** How a `url` assertion is checked: a plain substring, or a regex when the route has dynamic parts. */
export type UrlAssertionPattern =
  { kind: 'contains'; value: string } | { kind: 'regex'; source: string }

const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g

function escapeRegex(text: string): string {
  return text.replace(REGEX_METACHARACTERS, '\\$&')
}

/** Splits an expected route into the form every framework can check. */
export function urlAssertionPattern(expected: string): UrlAssertionPattern {
  const segments = expected.split('/')
  if (!segments.some((s) => DYNAMIC_ROUTE_SEGMENT_PATTERN.test(s))) {
    return { kind: 'contains', value: expected }
  }
  const source = segments
    .map((s) =>
      DYNAMIC_ROUTE_SEGMENT_PATTERN.test(s) ? DYNAMIC_ROUTE_SEGMENT_REGEX_SOURCE : escapeRegex(s),
    )
    .join('/')
  return { kind: 'regex', source: `${source}${URL_PATH_END_REGEX_SOURCE}` }
}

/** Route up to its first dynamic segment — the part a plain "URL contains" check can rely on. */
export function urlStaticPrefix(expected: string): string {
  const segments = expected.split('/')
  const firstDynamic = segments.findIndex((s) => DYNAMIC_ROUTE_SEGMENT_PATTERN.test(s))
  if (firstDynamic === -1) return expected
  return segments.slice(0, firstDynamic).join('/') + '/'
}

/** Regex source for any expected route — static routes are matched to the end of the path. */
export function urlAssertionRegexSource(expected: string): string {
  const pattern = urlAssertionPattern(expected)
  return pattern.kind === 'regex'
    ? pattern.source
    : `${escapeRegex(pattern.value)}${URL_PATH_END_REGEX_SOURCE}`
}
