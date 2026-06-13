import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin'

export interface FeatureMergeResult {
  source: string
  /** Names of scenarios appended to the existing feature. */
  added: string[]
  /** Names of scenarios already present (de-duped by case-insensitive title). */
  skipped: string[]
}

/**
 * Merge two `.feature` files. Strategy:
 *   1. Parse both with `@cucumber/gherkin` (the same parser the BDD adapters
 *      use in tests — guarantees we accept any feature the renderer emits).
 *   2. Read the existing scenario titles from the AST.
 *   3. Walk the incoming source line-by-line and extract each scenario block
 *      (header + child step lines until the next `Scenario:` / `Scenario
 *      Outline:` / EOF). Append the ones whose titles aren't already in the
 *      existing file. The single `Feature:` header is preserved — we never
 *      emit duplicates.
 */
export function mergeFeatureFile(existing: string, incoming: string): FeatureMergeResult {
  const existingTitles = parseScenarioTitles(existing)
  const incomingBlocks = extractScenarioBlocks(incoming)

  const added: string[] = []
  const skipped: string[] = []
  const toAppend: string[] = []
  const seen = new Set(existingTitles.map((t) => t.toLowerCase()))

  for (const block of incomingBlocks) {
    const lower = block.title.toLowerCase()
    if (seen.has(lower)) {
      skipped.push(block.title)
      continue
    }
    toAppend.push(block.text)
    added.push(block.title)
    seen.add(lower)
  }

  if (!toAppend.length) {
    return { source: existing, added, skipped }
  }

  // Append after the last non-blank line so the new scenarios stack at the
  // bottom with a single blank-line separator.
  const trimmed = existing.replace(/\s+$/, '')
  const out = `${trimmed}\n\n${toAppend.join('\n\n')}\n`
  return { source: out, added, skipped }
}

function parseScenarioTitles(source: string): string[] {
  let counter = 0
  const builder = new AstBuilder(() => String(++counter))
  const matcher = new GherkinClassicTokenMatcher()
  const parser = new Parser(builder, matcher)
  try {
    const doc = parser.parse(source)
    const titles: string[] = []
    const feature = doc.feature
    if (!feature) return titles
    for (const child of feature.children ?? []) {
      if (child.scenario?.name) titles.push(child.scenario.name)
    }
    return titles
  } catch {
    // Malformed gherkin — fall back to a regex scan so the merger doesn't
    // explode mid-add. Worst case we treat the file as having zero scenarios
    // and append everything; user can dedupe by hand.
    return Array.from(source.matchAll(/^\s*Scenario(?:\s+Outline)?:\s*(.+?)\s*$/gm)).map(
      (m) => m[1],
    )
  }
}

interface ScenarioBlock {
  title: string
  /** Raw text starting at `Scenario:` and ending at the line before the next scenario or EOF. */
  text: string
}

const SCENARIO_HEADER_RE = /^(\s*)Scenario(?:\s+Outline)?:\s*(.+?)\s*$/

function extractScenarioBlocks(source: string): ScenarioBlock[] {
  const lines = source.split('\n')
  const headers: Array<{ line: number; title: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const m = SCENARIO_HEADER_RE.exec(lines[i])
    if (m) headers.push({ line: i, title: m[2] })
  }
  const blocks: ScenarioBlock[] = []
  for (let idx = 0; idx < headers.length; idx++) {
    const start = headers[idx].line
    const end = idx + 1 < headers.length ? headers[idx + 1].line : lines.length
    const slice = lines.slice(start, end).join('\n').replace(/\s+$/, '')
    blocks.push({ title: headers[idx].title, text: slice })
  }
  return blocks
}
