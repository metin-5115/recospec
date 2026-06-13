import type { RejectedCandidate, ScoredLocator } from '@shared/types/locator'
import { resolveLocator } from './resolve'
import { isRenderable } from './renderability'

/**
 * Stage A of the pipeline: hard constraints. A candidate that fails ANY of
 * these cannot enter the bundle — it is recorded in `diagnostics` with a
 * reason instead of being merely down-scored. Scoring (stage B) only ever
 * ranks candidates that are already valid.
 */

/** A scored candidate paired with its (already computed) snapshot resolution. */
export interface ResolvedCandidate {
  candidate: ScoredLocator
  matches: Element[]
}

export interface ConstraintResult {
  passed: ScoredLocator[]
  diagnostics: RejectedCandidate[]
}

function selectorString(loc: ScoredLocator): string {
  return typeof loc.selector === 'string' ? loc.selector : JSON.stringify(loc.selector)
}

function toDiagnostic(
  loc: ScoredLocator,
  reason: RejectedCandidate['reason'],
  detail?: string,
): RejectedCandidate {
  return { strategy: loc.strategy, selector: selectorString(loc), reason, detail, score: loc.score }
}

/**
 * Apply the three hard constraints to every candidate:
 *  1. Renderability — Playwright + at least one other framework.
 *  2. No raw volatile value — a locator string must never embed a text the
 *     classifier marked as a data value; those become template locators
 *     instead of raw embeddings.
 *  3. Uniqueness — resolves to exactly the recorded element in the snapshot
 *     (strategy-aware counting happens in `resolveLocator`).
 */
export function applyConstraints(
  resolved: ResolvedCandidate[],
  element: Element,
): ConstraintResult {
  const passed: ScoredLocator[] = []
  const diagnostics: RejectedCandidate[] = []

  for (const { candidate, matches } of resolved) {
    if (!isRenderable(candidate.strategy)) {
      diagnostics.push(
        toDiagnostic(
          candidate,
          'not-renderable',
          'requires Playwright + at least one other framework',
        ),
      )
      continue
    }
    if (candidate.volatile === true) {
      diagnostics.push(
        toDiagnostic(
          candidate,
          'volatile-raw-value',
          'locator embeds a raw data value (date/price/number)',
        ),
      )
      continue
    }
    if (matches.length !== 1) {
      diagnostics.push(toDiagnostic(candidate, 'not-unique', `matched ${matches.length} elements`))
      continue
    }
    if (matches[0] !== element) {
      diagnostics.push(
        toDiagnostic(candidate, 'validation-failed', 'unique match is a different element'),
      )
      continue
    }
    passed.push(candidate)
  }

  return { passed, diagnostics }
}

/**
 * Post-production validation (stage C gate): every bundle member must still
 * resolve to exactly the recorded element. By construction this should hold;
 * the assert exists so a regression in any strategy can never ship a broken
 * primary silently.
 */
export function validateBundleMember(
  candidate: ScoredLocator,
  element: Element,
  doc: Document,
): boolean {
  const matches = resolveLocator(candidate, doc)
  return matches.length === 1 && matches[0] === element
}
