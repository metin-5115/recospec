import { LocatorEngine } from '@locator/index'
import { scoreFeatures, WEIGHTS, type WeightTable } from '@locator/pipeline/weights'
import type { ScoredLocator } from '@shared/types/locator'
import { CORPUS } from './corpus'
import { MUTATION_OPERATORS } from './mutations'
import { createRng } from './mutations/prng'
import { prepare, parse, resolvesToAnchor, mutationSeed, type PreparedScenario } from './survival'

/**
 * Weight calibration via grid search. For a candidate weight table we re-rank
 * each bundle's exposed members ([primary, ...fallbacks]) and measure the
 * survival of the NEW top pick across all mutations. The combination with the
 * highest primarySurvival is reported as a PROPOSAL — never written. Run with
 * `pnpm bench:calibrate`.
 *
 * ASSUMPTION: re-ranking is limited to the bundle's exposed validated members
 * (primary + 2 diverse fallbacks), not every candidate the engine considered.
 * That is the user-facing lever — primary selection among the locators we
 * actually ship — and keeps the sweep cheap and honest.
 */

interface RankableTarget {
  anchorId: string
  candidates: ScoredLocator[]
  /** Pre-mutated docs keyed by mutation name, reused across every grid point. */
  mutatedDocs: Record<string, Document>
}

function buildRankables(): RankableTarget[] {
  const engine = new LocatorEngine()
  const prepared: PreparedScenario[] = CORPUS.map((s) => prepare(s, engine))
  const out: RankableTarget[] = []
  for (const ps of prepared) {
    const mutatedDocs: Record<string, Document> = {}
    for (const op of MUTATION_OPERATORS) {
      const doc = parse(ps.markedHtml)
      op.apply(doc, createRng(mutationSeed(op.name, ps.scenario.name)))
      mutatedDocs[op.name] = doc
    }
    for (const t of ps.targets) {
      out.push({
        anchorId: t.anchorId,
        candidates: [t.bundle.primary, ...t.bundle.fallbacks].filter((c) => c.features),
        mutatedDocs,
      })
    }
  }
  return out
}

/** Primary survival when each target's primary is the top pick under `weights`. */
function survivalUnder(weights: WeightTable, targets: RankableTarget[]): number {
  let total = 0
  let survived = 0
  for (const t of targets) {
    if (t.candidates.length === 0) continue
    const chosen = t.candidates.reduce((best, c) =>
      scoreFeatures(c.features!, weights) > scoreFeatures(best.features!, weights) ? c : best,
    )
    for (const op of MUTATION_OPERATORS) {
      total += 1
      if (resolvesToAnchor(chosen, t.anchorId, t.mutatedDocs[op.name]!)) survived += 1
    }
  }
  return total ? survived / total : 1
}

export interface CalibrationResult {
  baseline: number
  best: number
  proposal: Partial<WeightTable>
  improvedBy: number
}

const GRID = {
  attrTier3: [30, 40, 50],
  textIsData: [-35, -45, -55],
  positionalIndex: [-35, -45, -55],
  depthPerStep: [4, 6],
}

export function calibrate(): CalibrationResult {
  const targets = buildRankables()
  const baseline = survivalUnder(WEIGHTS, targets)

  let best = baseline
  let proposal: Partial<WeightTable> = {}

  for (const a of GRID.attrTier3) {
    for (const t of GRID.textIsData) {
      for (const p of GRID.positionalIndex) {
        for (const d of GRID.depthPerStep) {
          const candidate: WeightTable = {
            ...WEIGHTS,
            attrTier: [0, 15, 25, a],
            textIsData: t,
            positionalIndex: p,
            depthPerStep: d,
          }
          const score = survivalUnder(candidate, targets)
          if (score > best) {
            best = score
            proposal = {
              attrTier: [0, 15, 25, a],
              textIsData: t,
              positionalIndex: p,
              depthPerStep: d,
            }
          }
        }
      }
    }
  }

  return { baseline, best, proposal, improvedBy: best - baseline }
}

export function formatCalibration(result: CalibrationResult): string {
  const lines: string[] = []
  lines.push('── Weight calibration (proposal only — not written) ──')
  lines.push(`baseline primarySurvival: ${(result.baseline * 100).toFixed(1)}%`)
  lines.push(`best     primarySurvival: ${(result.best * 100).toFixed(1)}%`)
  lines.push(`improvement: ${(result.improvedBy * 100).toFixed(1)} pts`)
  if (Object.keys(result.proposal).length === 0) {
    lines.push('proposal: none — current WEIGHTS are already optimal on this corpus.')
  } else {
    lines.push('proposal (apply manually to src/locator-engine/pipeline/weights.ts):')
    lines.push(JSON.stringify(result.proposal, null, 2))
  }
  lines.push('──────────────────────────────────────────────────────')
  return lines.join('\n')
}
