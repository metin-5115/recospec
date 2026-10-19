import type { AssertionSuggestion, ElementSnapshot } from './types/action'
import { isDynamicValue } from './dynamic-value'
import { suggestedPattern, stableSubstring } from './assertion-pattern'
import { slugifyKebab } from './slug'
import { normalizeUrl } from '@codegen/normalizer/url-normalizer'

/**
 * Value assertions for an element's text. Stable text → exact + contains.
 * Dynamic value (price/date/number) → not-empty + a stable-substring contains +
 * a shape-matching regex, so the assertion survives the value changing.
 */
export function valueAssertionSuggestions(text: string): AssertionSuggestion[] {
  if (!isDynamicValue(text)) {
    return [
      { type: 'text', label: `Expect text: "${text.slice(0, 50)}"`, expected: text },
      {
        type: 'text-contains',
        label: `Expect text contains: "${text.slice(0, 30)}"`,
        expected: text,
      },
    ]
  }
  const out: AssertionSuggestion[] = [{ type: 'not-empty', label: 'Expect not empty' }]
  const sub = stableSubstring(text)
  if (sub)
    out.push({ type: 'text-contains', label: `Expect text contains: "${sub}"`, expected: sub })
  const pattern = suggestedPattern(text)
  out.push({ type: 'matches', label: `Expect text matches: /${pattern}/`, expected: pattern })
  return out
}

/**
 * "The page URL contains this route" — a page-level assertion, offered next to the element ones.
 * `undefined` when the page has no route (`about:blank`).
 */
export function urlAssertionSuggestion(pageUrl: string): AssertionSuggestion | undefined {
  const route = normalizeUrl(pageUrl)
  if (!route.startsWith('/')) return undefined
  return { type: 'url', label: `Expect URL contains: ${route}`, expected: route }
}

/**
 * Synthesize the default `AssertionSuggestion` set for an already-recorded
 * element. Mirrors `buildSuggestions` from `src/content/element-probe.ts`,
 * but takes a stored snapshot instead of a live `Element` so the side panel
 * can offer assertion options for a step after recording has stopped — the
 * page may not even be open anymore.
 */
export function suggestionsForSnapshot(
  snapshot: ElementSnapshot,
  pageTitle: string,
  currentValue?: string,
  pageUrl?: string,
): AssertionSuggestion[] {
  const suggestions: AssertionSuggestion[] = [{ type: 'visible', label: 'Expect visible' }]

  // For dynamic values (price/date/number) we offer not-empty / contains /
  // matches instead of exact text — see valueAssertionSuggestions.
  const text = snapshot.textContent
  if (text) suggestions.push(...valueAssertionSuggestions(text))

  const tag = snapshot.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const value = currentValue ?? snapshot.attributes['value'] ?? ''
    suggestions.push({
      type: 'value',
      label: value ? `Expect value: "${value}"` : 'Expect value',
      expected: value,
    })
  }

  suggestions.push({ type: 'hidden', label: 'Expect hidden' })
  suggestions.push({
    type: 'screenshot',
    label: 'Screenshot match',
    name: slugifyKebab(pageTitle, 'snapshot'),
    threshold: 0.2,
  })

  const urlSuggestion = pageUrl ? urlAssertionSuggestion(pageUrl) : undefined
  if (urlSuggestion) suggestions.push(urlSuggestion)

  return suggestions
}
