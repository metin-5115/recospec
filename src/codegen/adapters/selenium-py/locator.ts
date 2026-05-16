import type { IRElement, IRFallback } from '../../ir/types'

/** Escape a single-quoted Python string literal. */
function pyStr(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** Escape a double-quoted Python string literal — used for XPath expressions that themselves contain single quotes. */
function pyDoubleStr(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

interface ParsedRoleName {
  role: string
  name: string
}

/** Parse the IR's role-name locatorValue (e.g. `'button', { name: 'Sign In' }`). */
function parseRoleName(value: string): ParsedRoleName | null {
  const match = value.match(/^['"]([^'"]+)['"]\s*,\s*\{\s*name:\s*['"]([^'"]+)['"]\s*\}\s*$/)
  if (!match) return null
  return { role: match[1], name: match[2] }
}

/** XPath-safe quoting for a value that may contain both ' and ". */
function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`
  if (!value.includes('"')) return `"${value}"`
  // mixed: split on ' and use concat()
  const parts = value.split("'").map((p) => `'${p}'`)
  return `concat(${parts.join(`, "'", `)})`
}

interface ByTuple {
  by: 'CSS_SELECTOR' | 'XPATH' | 'ID' | 'NAME' | 'CLASS_NAME'
  value: string
}

/** Map an IRElement to a Selenium `(By.X, "selector")` tuple expression. */
export function renderByTuple(el: IRElement): ByTuple {
  const strategy = el.locatorStrategy
  const val = el.locatorValue

  if (strategy === 'testid') {
    const name = val.replace(/^\[data-testid="(.+)"\]$/, '$1')
    return { by: 'CSS_SELECTOR', value: `[data-testid="${name}"]` }
  }
  if (strategy === 'aria-label') {
    const label = val.replace(/^\[aria-label="(.+)"\]$/, '$1')
    return { by: 'CSS_SELECTOR', value: `[aria-label="${label}"]` }
  }
  if (strategy === 'role-name') {
    const parsed = parseRoleName(val)
    const tag = el.tagName?.toLowerCase() || '*'
    if (parsed) {
      const lit = xpathLiteral(parsed.name)
      return { by: 'XPATH', value: `//${tag}[normalize-space()=${lit}]` }
    }
    return { by: 'XPATH', value: `//${tag}` }
  }
  if (strategy === 'text') {
    const lit = xpathLiteral(val)
    return { by: 'XPATH', value: `//*[normalize-space()=${lit}]` }
  }
  if (strategy === 'id') {
    const id = val.replace(/^#/, '')
    return { by: 'ID', value: id }
  }
  if (strategy === 'xpath') {
    return { by: 'XPATH', value: val }
  }
  // css, label (which is a CSS selector chain), default fallback
  return { by: 'CSS_SELECTOR', value: val }
}

/**
 * Render the `(By.X, "...")` tuple as a Python source expression.
 * Picks single or double quotes so the inner selector doesn't need escaping when possible.
 */
export function renderLocatorTuple(el: IRElement): string {
  const { by, value } = renderByTuple(el)
  // XPath values often contain ' — use double quotes; CSS uses single quotes.
  const quoted = by === 'XPATH' ? pyDoubleStr(value) : pyStr(value)
  return `(By.${by}, ${quoted})`
}

/**
 * Render a fallback tuple. Mirrors `renderLocatorTuple` but operates on an
 * IRFallback (which lacks a tagName — fallbacks for role-name use `//*[...]`).
 */
export function renderFallbackTuple(f: IRFallback): string {
  const synthetic: IRElement = {
    name: '_fallback',
    locatorStrategy: f.strategy,
    locatorValue: f.locatorValue,
    tagName: '*',
  }
  return renderLocatorTuple(synthetic)
}

export { pyStr, pyDoubleStr }
