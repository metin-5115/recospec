export type XmlAttrValue = string | number | boolean | undefined

export type XmlAttrs = Record<string, XmlAttrValue>

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

const INDENT = '  '

/** Escapes text and attribute values alike so a raw value maps to one escaped form. */
export function escapeXml(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => XML_ESCAPES[ch] ?? ch)
}

function renderAttrs(attrs: XmlAttrs): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue
    parts.push(` ${key}="${escapeXml(String(value))}"`)
  }
  return parts.join('')
}

function indentBlock(block: string): string {
  return block
    .split('\n')
    .map((line) => (line.length > 0 ? `${INDENT}${line}` : line))
    .join('\n')
}

/** Element with child elements; self-closes when there are no children. */
export function xmlBlock(name: string, attrs: XmlAttrs = {}, children: string[] = []): string {
  const open = `<${name}${renderAttrs(attrs)}`
  if (children.length === 0) return `${open}/>`
  return `${open}>\n${children.map(indentBlock).join('\n')}\n</${name}>`
}

/** Element holding escaped text content. */
export function xmlText(name: string, attrs: XmlAttrs, text: string): string {
  return `<${name}${renderAttrs(attrs)}>${escapeXml(text)}</${name}>`
}
