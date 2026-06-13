import { LocatorEngine } from '@locator/index'
import { resolveLocator } from '@locator/pipeline/resolve'
import type { LocatorBundle, ScoredLocator } from '@shared/types/locator'
import { CORPUS, type CorpusScenario } from './corpus'
import { MUTATION_OPERATORS, ANCHOR_ATTR } from './mutations'
import { createRng } from './mutations/prng'

/**
 * Mutation-survival harness. For every recorded target the engine builds a
 * bundle on the pristine DOM; then each mutation operator is applied to a fresh
 * clone and the bundle is re-resolved. A locator "survives" when it still
 * resolves to EXACTLY the same element (tracked by a `data-bench-anchor`
 * marker added AFTER the bundle is built, so locators never key on it).
 */

const DEFAULT_SEED = 0x9e3779b9

export interface PreparedTarget {
  anchorId: string
  bundle: LocatorBundle
}

export interface PreparedScenario {
  scenario: CorpusScenario
  markedHtml: string
  targets: PreparedTarget[]
}

export function parse(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  )
}

/** Build bundles on pristine DOM, then stamp anchors and serialize. */
export function prepare(scenario: CorpusScenario, engine: LocatorEngine): PreparedScenario {
  const doc = parse(scenario.html)
  const targets: PreparedTarget[] = []
  scenario.targets.forEach((selector, i) => {
    const el = doc.querySelector(selector)
    if (!el) return
    const bundle = engine.evaluate(el, doc)
    if (!bundle) return
    const anchorId = `${scenario.name}#${i}`
    el.setAttribute(ANCHOR_ATTR, anchorId)
    targets.push({ anchorId, bundle })
  })
  return { scenario, markedHtml: doc.body.innerHTML, targets }
}

/** Deterministic mutation seed for a (mutation, scenario) pair. */
export function mutationSeed(
  mutationName: string,
  scenarioName: string,
  base = DEFAULT_SEED,
): number {
  return base ^ (mutationName.length << 8) ^ scenarioName.length
}

/** Does `loc` resolve to exactly the anchor-marked element in `doc`? */
export function resolvesToAnchor(loc: ScoredLocator, anchorId: string, doc: Document): boolean {
  const marked = doc.querySelector(`[${ANCHOR_ATTR}="${cssEscape(anchorId)}"]`)
  if (!marked) return false
  let matches: Element[]
  try {
    matches = resolveLocator(loc, doc)
  } catch {
    return false
  }
  return matches.length === 1 && matches[0] === marked
}

/** Minimal attribute-value escaper (jsdom has no global CSS.escape in tests). */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

export interface CellStat {
  total: number
  primarySurvived: number
  bundleSurvived: number
}

export interface SurvivalReport {
  totalTargets: number
  primarySurvival: number
  bundleSurvival: number
  /** mutation operator → primary/bundle survival. */
  byMutation: Record<string, CellStat>
  /** primary strategy → primary/bundle survival across all mutations. */
  byStrategy: Record<string, CellStat>
  /** mutation × strategy breakdown matrix. */
  matrix: Record<string, Record<string, CellStat>>
}

function bump(map: Record<string, CellStat>, key: string, primary: boolean, bundle: boolean): void {
  const cell = (map[key] ??= { total: 0, primarySurvived: 0, bundleSurvived: 0 })
  cell.total += 1
  if (primary) cell.primarySurvived += 1
  if (bundle) cell.bundleSurvived += 1
}

export interface SurvivalOptions {
  seed?: number
  scenarios?: readonly CorpusScenario[]
}

export function runSurvival(options: SurvivalOptions = {}): SurvivalReport {
  const engine = new LocatorEngine()
  const scenarios = options.scenarios ?? CORPUS
  const prepared = scenarios.map((s) => prepare(s, engine))

  const byMutation: Record<string, CellStat> = {}
  const byStrategy: Record<string, CellStat> = {}
  const matrix: Record<string, Record<string, CellStat>> = {}
  let totalTargets = 0
  let primarySurvived = 0
  let bundleSurvived = 0

  for (const op of MUTATION_OPERATORS) {
    matrix[op.name] = {}
    for (const ps of prepared) {
      // Deterministic per (mutation, scenario): seed mixes both names' lengths.
      const rng = createRng(mutationSeed(op.name, ps.scenario.name, options.seed ?? DEFAULT_SEED))
      const doc = parse(ps.markedHtml)
      op.apply(doc, rng)

      for (const t of ps.targets) {
        const strategy = t.bundle.primary.strategy
        const primaryOk = resolvesToAnchor(t.bundle.primary, t.anchorId, doc)
        const members = [t.bundle.primary, ...t.bundle.fallbacks]
        const bundleOk = members.some((m) => resolvesToAnchor(m, t.anchorId, doc))

        totalTargets += 1
        if (primaryOk) primarySurvived += 1
        if (bundleOk) bundleSurvived += 1
        bump(byMutation, op.name, primaryOk, bundleOk)
        bump(byStrategy, strategy, primaryOk, bundleOk)
        bump(matrix[op.name]!, strategy, primaryOk, bundleOk)
      }
    }
  }

  return {
    totalTargets,
    primarySurvival: totalTargets ? primarySurvived / totalTargets : 1,
    bundleSurvival: totalTargets ? bundleSurvived / totalTargets : 1,
    byMutation,
    byStrategy,
    matrix,
  }
}

/** Count of distinct (scenario, target) pairs the engine could build a bundle for. */
export function preparedTargetCount(scenarios: readonly CorpusScenario[] = CORPUS): number {
  const engine = new LocatorEngine()
  return scenarios.reduce((sum, s) => sum + prepare(s, engine).targets.length, 0)
}
