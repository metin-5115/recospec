import { IMPLICIT_ROLE_TABLE } from '@locator/strategies/role-table'

export interface ParsedRoleName {
  role: string
  name?: string
}

const ENGINE_ROLE_NAME = /^([a-z][\w-]*)\[name="([\s\S]*)"\]$/
const LEGACY_ROLE_NAME = /^(['"])([^'"]+)\1\s*,\s*\{\s*name:\s*(['"])([\s\S]*)\3\s*\}$/
const BARE_ROLE = /^[a-z][\w-]*$/

function parseJsonRoleName(value: string): ParsedRoleName | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { role, name } = parsed as { role?: unknown; name?: unknown }
    if (typeof role !== 'string') return null
    return typeof name === 'string' ? { role, name } : { role }
  } catch {
    return null
  }
}

/**
 * Parse a role-name `locatorValue` into its role and accessible name. Accepts
 * the engine's `button[name="Apply"]`, the legacy `'button', { name: 'Apply' }`
 * argument list, a JSON `{"role","name"}` object, or a bare role.
 */
export function parseRoleName(value: string): ParsedRoleName | null {
  const engine = value.match(ENGINE_ROLE_NAME)
  if (engine) return { role: engine[1], name: engine[2] }
  const legacy = value.match(LEGACY_ROLE_NAME)
  if (legacy) return { role: legacy[2], name: legacy[4] }
  if (value.startsWith('{')) return parseJsonRoleName(value)
  if (BARE_ROLE.test(value)) return { role: value }
  return null
}

/** XPath-safe quoting for a value that may contain both ' and ". */
export function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`
  if (!value.includes('"')) return `"${value}"`
  const parts = value.split("'").map((p) => `'${p}'`)
  return `concat(${parts.join(`, "'", `)})`
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function implicitTagsFor(role: string): string[] {
  const tags = IMPLICIT_ROLE_TABLE.filter((row) => row.role === role)
    .map((row) => row.selector.match(/^[a-z][a-z0-9]*/)?.[0])
    .filter((tag): tag is string => Boolean(tag))
  return [...new Set(tags)]
}

/** `tag`, or — when the tag is unknown — any element carrying the role explicitly or implicitly. */
function roleNodeTest(role: string, tag: string): string {
  if (tag && tag !== '*') return tag
  const alternatives = [
    `@role=${xpathLiteral(role)}`,
    ...implicitTagsFor(role).map((t) => `self::${t}`),
  ]
  return `*[${alternatives.join(' or ')}]`
}

function labelledBy(literal: string): string {
  return `@id=//label[normalize-space(.)=${literal}]/@for or ancestor::label[normalize-space(.)=${literal}]`
}

const LABELLED_CONTROL_ROLES = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'spinbutton',
  'slider',
  'checkbox',
  'radio',
  'switch',
])

/** The accessible-name sources that apply to `role`, as XPath predicates. */
function nameSources(role: string, lit: string): string[] {
  if (LABELLED_CONTROL_ROLES.has(role))
    return [labelledBy(lit), `@aria-label=${lit}`, `@placeholder=${lit}`]
  if (role === 'button') return [`normalize-space(.)=${lit}`, `@value=${lit}`, `@aria-label=${lit}`]
  if (role === 'img') return [`@alt=${lit}`, `@aria-label=${lit}`]
  return [`normalize-space(.)=${lit}`, `@aria-label=${lit}`]
}

/**
 * XPath for an element with `role` whose accessible name is `name`. Form
 * controls are named by their label, aria-label or placeholder; buttons by
 * text, value or aria-label; images by alt; everything else by text.
 */
export function roleNameXPath(role: string, name: string | undefined, tag: string): string {
  const nodeTest = roleNodeTest(role, tag)
  if (name === undefined) return `//${nodeTest}`
  const lit = xpathLiteral(collapseWhitespace(name))
  return `//${nodeTest}[${nameSources(role, lit).join(' or ')}]`
}

/** XPath for the form control labelled `label` via `<label for>` or a wrapping `<label>`. */
export function labelXPath(label: string, tag: string): string {
  const nodeTest = tag && tag !== '*' ? tag : '*[self::input or self::select or self::textarea]'
  return `//${nodeTest}[${labelledBy(xpathLiteral(collapseWhitespace(label)))}]`
}
