import type { AssertionSuggestion, ElementSnapshot } from './types/action'
import { isDynamicValue } from './dynamic-value'

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'snapshot'
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
): AssertionSuggestion[] {
  const suggestions: AssertionSuggestion[] = [{ type: 'visible', label: 'Expect visible' }]

  // Skip exact-text assertions when the content is a dynamic value (price,
  // date, number): asserting `toHaveText("294.840")` breaks the moment the
  // value changes. "Expect visible" remains the safe default.
  const text = snapshot.textContent
  if (text && !isDynamicValue(text)) {
    suggestions.push({
      type: 'text',
      label: `Expect text: "${text.slice(0, 50)}"`,
      expected: text,
    })
    suggestions.push({
      type: 'text-contains',
      label: `Expect text contains: "${text.slice(0, 30)}"`,
      expected: text,
    })
  }

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
    name: slugifyTitle(pageTitle),
    threshold: 0.2,
  })

  return suggestions
}
