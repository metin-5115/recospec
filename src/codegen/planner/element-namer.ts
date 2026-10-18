import type { ElementSnapshot } from '@shared/types/action'
import type { Locator } from '@shared/types/locator'
import { ELEMENT_NAME_MAX_WORDS } from '@shared/constants'

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

/** Letters Unicode decomposition cannot reduce to ASCII; Turkish dotless/dotted i included. */
const TRANSLITERATIONS: Record<string, string> = {
  ı: 'i',
  İ: 'I',
  ß: 'ss',
  ø: 'o',
  Ø: 'O',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
}

/** `Uçuş ara` → `Ucus ara`, so non-ASCII letters shorten a name instead of splitting it. */
function toAscii(raw: string): string {
  return raw
    .replace(/[ıİßøØłŁđĐæÆœŒ]/g, (ch) => TRANSLITERATIONS[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const CURRENCY_SYMBOLS = /[₺$€£¥]/
const CURRENCY_CODES = /\b(TRY|TL|USD|EUR|GBP|JPY|RUB|CHF)\b/g
const PRICE_PATTERN = /\d[.,]\d{3}\b/
const YEAR_PATTERN = /\b(19|20)\d{2}\b/

/**
 * A calendar cell or product tile reads like "Nov 25 Wednesday, 2026 6.300 ₺" or "Plan - 65.61
 * TRY": the date and price are data, so they must not be frozen into an identifier. A currency
 * code counts only next to a number ("Pay in USD" is a plain label), and plain digits ("Step 2")
 * are kept.
 */
function stripDataValues(raw: string): string {
  const hasDigit = /\d/.test(raw)
  const isDataLike =
    CURRENCY_SYMBOLS.test(raw) ||
    (hasDigit && new RegExp(CURRENCY_CODES.source).test(raw)) ||
    PRICE_PATTERN.test(raw) ||
    YEAR_PATTERN.test(raw)
  if (!isDataLike) return raw
  const stripped = raw
    .replace(new RegExp(CURRENCY_SYMBOLS.source, 'g'), ' ')
    .replace(CURRENCY_CODES, ' ')
    .replace(/\S*\d\S*/g, ' ')
  return /[^\W\d_]/.test(stripped) ? stripped : raw
}

/**
 * @param maxWords keep only the first N words; a sentence-long accessible name would otherwise
 *   become an identifier of 80+ characters. Omit it to keep every word (testids, for instance).
 */
function toCamelCase(raw: string, maxWords?: number): string {
  return toAscii(raw)
    .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, maxWords)
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

/** An identifier cannot start with a digit ("15 kg" → `15Kg`); lead with the element's tag. */
function startWithLetter(name: string, tag: string): string {
  if (!/^[0-9]/.test(name)) return name
  const prefix = tag.replace(/[^a-z0-9]/g, '') || 'el'
  return `${/^[0-9]/.test(prefix) ? 'el' : prefix}${capitalize(name)}`
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
    baseName = toCamelCase(stripDataValues(attrs['aria-label']), ELEMENT_NAME_MAX_WORDS) + suffix
  } else if (accessibleNameOf([locator, ...nameHints])) {
    const { name, role } = accessibleNameOf([locator, ...nameHints])!
    const camel = toCamelCase(stripDataValues(stripParenthetical(name)), ELEMENT_NAME_MAX_WORDS)
    const roleSuffix = (role && ROLE_SUFFIX[role]) ?? suffix
    const withSuffix = camel.toLowerCase().endsWith(roleSuffix.toLowerCase())
      ? camel
      : camel + roleSuffix
    const anchor = locator.composed?.anchor.filterText
    baseName = anchor
      ? toCamelCase(stripParenthetical(anchor), ELEMENT_NAME_MAX_WORDS) + capitalize(withSuffix)
      : withSuffix
  } else if (snapshot.textContent?.trim() && !NAMELESS_TEXT_TAGS.has(tag)) {
    baseName =
      toCamelCase(
        stripDataValues(snapshot.textContent.trim().slice(0, 40)),
        ELEMENT_NAME_MAX_WORDS,
      ) + suffix
  } else if (attrs['placeholder']) {
    baseName = toCamelCase(attrs['placeholder'], ELEMENT_NAME_MAX_WORDS) + suffix
  } else {
    baseName = tag + suffix || 'element'
  }

  if (!baseName) baseName = 'element'
  baseName = startWithLetter(baseName, tag)

  return uniquify(baseName, usedNames)
}
