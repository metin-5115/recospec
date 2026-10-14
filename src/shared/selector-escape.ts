/**
 * Escaping helpers for values that are spliced into generated selectors.
 * Recorded attribute values are arbitrary page text, so every one of them must
 * go through one of these before landing inside a CSS / XPath / JS literal.
 */

/**
 * Escape a value for use inside a double-quoted CSS attribute selector:
 * `[name="${cssAttrValue(v)}"]`. A raw newline is not legal inside a CSS
 * string, so it becomes the `\a ` escape.
 */
export function cssAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ')
}

/**
 * Render a value as an XPath 1.0 string literal. XPath has no escape sequences,
 * so a value containing the quote char is wrapped in the other one, and a value
 * containing both is split into a `concat()` of the pieces.
 *
 * `preferredQuote` is the wrapper used when the value allows it.
 */
export function xpathLiteral(value: string, preferredQuote: '"' | "'" = "'"): string {
  const other = preferredQuote === '"' ? "'" : '"'
  if (!value.includes(preferredQuote)) return `${preferredQuote}${value}${preferredQuote}`
  if (!value.includes(other)) return `${other}${value}${other}`
  const parts = value.split(preferredQuote).map((p) => `${preferredQuote}${p}${preferredQuote}`)
  return `concat(${parts.join(`, ${other}${preferredQuote}${other}, `)})`
}

/** Render a value as a single-quoted JS/TS string literal (for generated code). */
export function jsSingleQuoted(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
  return `'${escaped}'`
}
