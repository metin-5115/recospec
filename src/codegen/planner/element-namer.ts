import type { ElementSnapshot } from '@shared/types/action'
import type { Locator } from '@shared/types/locator'

const TAG_SUFFIX: Record<string, string> = {
  input: 'Input',
  button: 'Button',
  a: 'Link',
  select: 'Select',
  textarea: 'Input',
}

function toCamelCase(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w, i) =>
      i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join('')
}

function uniquify(base: string, usedNames: Set<string>): string {
  if (!usedNames.has(base)) return base
  let i = 2
  while (usedNames.has(`${base}${i}`)) i++
  return `${base}${i}`
}

export function nameElement(
  snapshot: ElementSnapshot,
  locator: Locator,
  usedNames: Set<string>,
): string {
  const tag = snapshot.tagName.toLowerCase()
  const suffix = TAG_SUFFIX[tag] ?? ''
  const attrs = snapshot.attributes

  let baseName: string

  if (locator.strategy === 'testid' && typeof locator.selector === 'string') {
    baseName = toCamelCase(locator.selector)
  } else if (locator.strategy === 'aria-label' && attrs['aria-label']) {
    baseName = toCamelCase(attrs['aria-label']) + suffix
  } else if (snapshot.textContent?.trim()) {
    baseName = toCamelCase(snapshot.textContent.trim().slice(0, 40)) + suffix
  } else if (attrs['placeholder']) {
    baseName = toCamelCase(attrs['placeholder']) + suffix
  } else {
    baseName = tag + suffix || 'element'
  }

  if (!baseName) baseName = 'element'

  return uniquify(baseName, usedNames)
}
