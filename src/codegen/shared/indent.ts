/** Prefix every non-empty line of `text` with `pad`. Blank lines stay blank. */
export function indentLines(text: string, pad: string): string {
  return text
    .split('\n')
    .map((line) => (line.length ? `${pad}${line}` : line))
    .join('\n')
}

/** `indentLines` with a space count instead of a literal prefix. */
export function indentBlock(text: string, spaces: number): string {
  return indentLines(text, ' '.repeat(spaces))
}
