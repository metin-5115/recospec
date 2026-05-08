import type { IRElement, IRFallback } from '../../ir/types'

/** Escape a Java double-quoted string literal. */
export function javaStr(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`
}

interface ParsedRoleName {
  role: string
  name: string
}

function parseRoleName(value: string): ParsedRoleName | null {
  const match = value.match(/^['"]([^'"]+)['"]\s*,\s*\{\s*name:\s*['"]([^'"]+)['"]\s*\}\s*$/)
  if (!match) return null
  return { role: match[1], name: match[2] }
}

/** XPath-safe quoting for a value that may contain both ' and ". */
function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`
  if (!value.includes('"')) return `"${value}"`
  const parts = value.split("'").map((p) => `'${p}'`)
  return `concat(${parts.join(`, "'", `)})`
}

export type FindByLocatorType = 'css' | 'xpath' | 'id' | 'name' | 'className'

export interface FindByLocator {
  type: FindByLocatorType
  value: string
}

/** Map an IRElement to a `@FindBy` annotation locator (type + value). */
export function renderFindByLocator(el: {
  locatorStrategy: string
  locatorValue: string
  tagName?: string
}): FindByLocator {
  const strategy = el.locatorStrategy
  const val = el.locatorValue

  if (strategy === 'testid') {
    const name = val.replace(/^\[data-testid="(.+)"\]$/, '$1')
    return { type: 'css', value: `[data-testid="${name}"]` }
  }
  if (strategy === 'aria-label') {
    const label = val.replace(/^\[aria-label="(.+)"\]$/, '$1')
    return { type: 'css', value: `[aria-label="${label}"]` }
  }
  if (strategy === 'role-name') {
    const parsed = parseRoleName(val)
    const tag = el.tagName?.toLowerCase() || '*'
    if (parsed) {
      const lit = xpathLiteral(parsed.name)
      return { type: 'xpath', value: `//${tag}[normalize-space()=${lit}]` }
    }
    return { type: 'xpath', value: `//${tag}` }
  }
  if (strategy === 'text') {
    const lit = xpathLiteral(val)
    return { type: 'xpath', value: `//*[normalize-space()=${lit}]` }
  }
  if (strategy === 'id') {
    const id = val.replace(/^#/, '')
    return { type: 'id', value: id }
  }
  if (strategy === 'xpath') {
    return { type: 'xpath', value: val }
  }
  // css, label, default
  return { type: 'css', value: val }
}

/** Render the `@FindBy(...)` annotation source line for an IRElement. */
export function renderFindByAnnotation(el: IRElement): string {
  const { type, value } = renderFindByLocator(el)
  return `@FindBy(${type} = ${javaStr(value)})`
}

/** Render a single fallback locator in the same `@FindBy(...)` form. */
export function renderFallbackAnnotation(f: IRFallback): string {
  const { type, value } = renderFindByLocator({
    locatorStrategy: f.strategy,
    locatorValue: f.locatorValue,
    tagName: '*',
  })
  return `@FindBy(${type} = ${javaStr(value)})`
}

/** Render a `By.X("...")` expression — used for ad-hoc lookups in test bodies. */
export function renderByExpression(el: IRElement): string {
  const { type, value } = renderFindByLocator(el)
  switch (type) {
    case 'css':
      return `By.cssSelector(${javaStr(value)})`
    case 'xpath':
      return `By.xpath(${javaStr(value)})`
    case 'id':
      return `By.id(${javaStr(value)})`
    case 'name':
      return `By.name(${javaStr(value)})`
    case 'className':
      return `By.className(${javaStr(value)})`
  }
}
