import type { LocatorFeatures } from '@shared/types/locator'

/**
 * THE single tuning surface for candidate ranking. Every number that affects
 * which surviving candidate becomes primary lives here so the mutation
 * benchmark (`pnpm bench:calibrate`) can sweep them without touching logic.
 *
 * Initial values are hand-calibrated to reproduce sensible orderings:
 *   testid ≈ 90 · aria/role (stable name) ≈ 67 · id / attribute-css ≈ 65 ·
 *   composed (role anchor + name) ≈ 72 · stable-class css ≈ 50 ·
 *   stable text ≈ 42 · anything positional → single digits.
 */
export const WEIGHTS = {
  /** Every candidate starts here; features add or subtract. */
  base: 50,
  /** Indexed by `LocatorFeatures.attrTier` (0..3). */
  attrTier: [0, 15, 25, 40] as const,
  /** The text the locator keys on is a data value (date / price / count …). */
  textIsData: -45,
  /** Entropy above this (bits) starts looking like a hashed class name. */
  classEntropyThreshold: 3.0,
  /** Penalty per bit of entropy above the threshold. */
  classEntropyPerBit: 10,
  classEntropyMaxPenalty: 20,
  /** Penalty per combinator / path step beyond the first. */
  depthPerStep: 4,
  depthMaxPenalty: 20,
  /** :nth-* / [N] / .nth(i) — the genuine last resort. */
  positionalIndex: -45,
  /** Being scoped under a stable anchor is mildly protective. */
  composedBonus: 5,
  /** Indexed by the anchor's attrTier when composed (0..3). */
  anchorTier: [0, 4, 8, 12] as const,
  /** Keys on visible text / accessible name — breaks under i18n & copy edits. */
  localeDependent: -8,
} as const

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Widened shape of the weight table — lets the calibrator build swept variants
 * with arbitrary numbers (the `as const` `WEIGHTS` literal is assignable to it).
 */
export interface WeightTable {
  base: number
  attrTier: readonly [number, number, number, number]
  textIsData: number
  classEntropyThreshold: number
  classEntropyPerBit: number
  classEntropyMaxPenalty: number
  depthPerStep: number
  depthMaxPenalty: number
  positionalIndex: number
  composedBonus: number
  anchorTier: readonly [number, number, number, number]
  localeDependent: number
}

/**
 * Score a feature vector 0..100. Pure — no DOM, no strategy identity. The
 * weight table is injectable so `pnpm bench:calibrate` can sweep it without
 * touching engine logic; production always uses the module-level `WEIGHTS`.
 */
export function scoreFeatures(f: LocatorFeatures, weights: WeightTable = WEIGHTS): number {
  let score = weights.base
  score += weights.attrTier[f.attrTier]
  if (f.textIsData) score += weights.textIsData
  const excessEntropy = Math.max(0, f.classEntropy - weights.classEntropyThreshold)
  score -= Math.min(weights.classEntropyMaxPenalty, excessEntropy * weights.classEntropyPerBit)
  score -= Math.min(weights.depthMaxPenalty, Math.max(0, f.depth - 1) * weights.depthPerStep)
  if (f.hasPositionalIndex) score += weights.positionalIndex
  if (f.isComposed) {
    score += weights.composedBonus
    score += weights.anchorTier[f.anchorTier]
  }
  if (f.localeDependent) score += weights.localeDependent
  return Math.round(clamp(score, 0, 100))
}
