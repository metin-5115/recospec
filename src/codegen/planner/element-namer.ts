import type { ElementSnapshot } from '@shared/types/action'
import type { Locator } from '@shared/types/locator'

const TAG_SUFFIX: Record<string, string> = {
  input: 'Input',
  button: 'Button',
  a: 'Link',
  select: 'Select',
  textarea: 'Input',
}

/** Suffix by ARIA role, which is more precise than the tag (radio vs checkbox vs text input). */
const ROLE_SUFFIX: Record<string, string> = {
  textbox: 'Input',
  searchbox: 'Input',
  spinbutton: 'Input',
  combobox: 'Select',
  listbox: 'Select',
  radio: 'Radio',
  checkbox: 'Checkbox',
  switch: 'Toggle',
  button: 'Button',
  link: 'Link',
}

/** Tags whose `textContent` is not a name (a select's text is its options concatenated). */
const NAMELESS_TEXT_TAGS: ReadonlySet<string> = new Set(['select', 'textarea', 'input'])

interface AccessibleName {
  name: string
  role?: string
}

/** The accessible name any candidate locator carries (role-name beats a bare label). */
function accessibleNameOf(locators: Locator[]): AccessibleName | undefined {
  for (const loc of locators) {
    if (loc.strategy !== 'role-name' || typeof loc.selector !== 'string') continue
    const match = loc.selector.match(/^(\w+)\[name="(.*)"\]$/)
    if (match?.[2]) return { role: match[1], name: match[2] }
  }
  for (const loc of locators) {
    if (loc.strategy === 'label' && typeof loc.selector === 'string' && loc.selector.trim()) {
      return { name: loc.selector }
    }
  }
  return undefined
}

/** "Cart (3)" and "Express (+$12)" carry changing or decorative detail, not the name. */
function stripParenthetical(raw: string): string {
  return raw.replace(/\(.*?\)/g, ' ')
}

function toCamelCase(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word, i) => {
      // An all-caps word is an acronym ("CVV", "ZIP"), not camel-case humps.
      const w = /^[A-Z0-9]{2,}$/.test(word) ? word.toLowerCase() : word
      return i === 0
        ? w.charAt(0).toLowerCase() + w.slice(1)
        : w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join('')
}

/** `[data-testid="sign-in"]` / `[data-cy='x']` → the attribute value; raw values pass through. */
function testIdValue(selector: string): string {
  const match = selector.match(/^\[[\w-]+=(["'])(.*)\1\]$/)
  return match?.[2] ?? selector
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function uniquify(base: string, usedNames: Set<string>): string {
  if (!usedNames.has(base)) return base
  let i = 2
  while (usedNames.has(`${base}${i}`)) i++
  return `${base}${i}`
}

/**
 * @param nameHints extra candidate locators (fallbacks, rejected candidates) used only to find an
 *   accessible name when the primary locator is not name-based, e.g. a composed locator.
 */
export function nameElement(
  snapshot: ElementSnapshot,
  locator: Locator,
  usedNames: Set<string>,
  nameHints: Locator[] = [],
): string {
  const tag = snapshot.tagName.toLowerCase()
  const suffix = TAG_SUFFIX[tag] ?? ''
  const attrs = snapshot.attributes

  let baseName: string

  if (locator.strategy === 'template' && locator.template) {
    // The element's own text is a data value (a date, an entity name) — naming
    // it from the text would freeze one recorded sample into the identifier.
    baseName = locator.template.kind === 'date' ? 'dateCell' : 'itemByValue'
  } else if (locator.strategy === 'testid' && typeof locator.selector === 'string') {
    baseName = toCamelCase(testIdValue(locator.selector))
  } else if (locator.strategy === 'aria-label' && attrs['aria-label']) {
    baseName = toCamelCase(attrs['aria-label']) + suffix
  } else if (accessibleNameOf([locator, ...nameHints])) {
    const { name, role } = accessibleNameOf([locator, ...nameHints])!
    const camel = toCamelCase(stripParenthetical(name))
    const roleSuffix = (role && ROLE_SUFFIX[role]) ?? suffix
    const withSuffix = camel.toLowerCase().endsWith(roleSuffix.toLowerCase())
      ? camel
      : camel + roleSuffix
    const anchor = locator.composed?.anchor.filterText
    baseName = anchor
      ? toCamelCase(stripParenthetical(anchor)) + capitalize(withSuffix)
      : withSuffix
  } else if (snapshot.textContent?.trim() && !NAMELESS_TEXT_TAGS.has(tag)) {
    baseName = toCamelCase(snapshot.textContent.trim().slice(0, 40)) + suffix
  } else if (attrs['placeholder']) {
    baseName = toCamelCase(attrs['placeholder']) + suffix
  } else {
    baseName = tag + suffix || 'element'
  }

  if (!baseName) baseName = 'element'

  return uniquify(baseName, usedNames)
}
