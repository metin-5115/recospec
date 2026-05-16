import type { RecordedAction } from '@shared/types/action'

export interface SessionDiffChangedEntry {
  actionId: string
  /** Sibling actionId from the "before" session, when matched. */
  previousActionId: string
  /** True when the locator was replaced (strategy or selector changed). */
  locatorChanged: boolean
  /** True when the payload (fill value, key, etc.) changed. */
  valueChanged: boolean
}

export interface SessionDiff {
  /** Steps present in `b` but not paired to any step in `a`. */
  added: RecordedAction[]
  /** Steps present in `a` but not paired to any step in `b`. */
  removed: RecordedAction[]
  /** Paired steps where the locator and/or payload differ. */
  changed: SessionDiffChangedEntry[]
  /**
   * Paired indices `[i, j]` between `a[i]` and `b[j]`, in order. Useful for
   * a side-by-side renderer that wants to know which rows align.
   */
  pairs: Array<[number, number]>
}

/**
 * Tight shape-key: type + strategy + selector prefix. Pairs only steps that
 * really do target the same element with the same locator.
 */
function tightKey(step: RecordedAction): string {
  const strategy = step.target?.primaryLocator.strategy ?? '-'
  const sel = step.target?.primaryLocator.selector
  const selStr = typeof sel === 'string' ? sel : sel ? JSON.stringify(sel) : '-'
  return `${step.type}::${strategy}::${selStr.slice(0, 30)}`
}

/**
 * Loose shape-key: action type only. Used in a second pass over the
 * remainder so a `click` whose locator was rewritten still pairs with the
 * original click instead of producing a phantom add+remove.
 */
function looseKey(step: RecordedAction): string {
  return step.type
}

/** Classic LCS table on shape-keys (O(n*m) — bounded by acceptance: ≤100 steps). */
function lcsTable(a: string[], b: string[]): number[][] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  return dp
}

/**
 * Walk the LCS table forward, preferring the leftmost valid match. This is
 * the deterministic tie-breaker that makes a single `click` at `a[i]` align
 * with the `click` at `b[j]` whose position is closest to `i`, instead of
 * silently snapping to whichever index happens to be reached first by a
 * back-tracking traversal.
 */
function lcsPairs(a: string[], b: string[], dp: number[][]): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j])
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      // Skipping a[i] keeps the LCS length intact (or it's a tie) — drop it.
      i += 1
    } else {
      // Skipping b[j] keeps the LCS length intact.
      j += 1
    }
  }
  return pairs
}

function locatorMatches(a: RecordedAction, b: RecordedAction): boolean {
  const aLoc = a.target?.primaryLocator
  const bLoc = b.target?.primaryLocator
  if (!aLoc && !bLoc) return true
  if (!aLoc || !bLoc) return false
  if (aLoc.strategy !== bLoc.strategy) return false
  const aSel = typeof aLoc.selector === 'string' ? aLoc.selector : JSON.stringify(aLoc.selector)
  const bSel = typeof bLoc.selector === 'string' ? bLoc.selector : JSON.stringify(bLoc.selector)
  return aSel === bSel
}

function payloadMatches(a: RecordedAction, b: RecordedAction): boolean {
  return JSON.stringify(a.payload ?? null) === JSON.stringify(b.payload ?? null)
}

/** Run an LCS pass over the still-unmatched indices, returning pairs in `a`-absolute coordinates. */
function lcsOnRemaining(
  a: RecordedAction[],
  b: RecordedAction[],
  matchedA: ReadonlySet<number>,
  matchedB: ReadonlySet<number>,
  key: (step: RecordedAction) => string,
): Array<[number, number]> {
  const aRest = a.map((s, i) => ({ s, i })).filter(({ i }) => !matchedA.has(i))
  const bRest = b.map((s, i) => ({ s, i })).filter(({ i }) => !matchedB.has(i))
  if (aRest.length === 0 || bRest.length === 0) return []
  const aKeys = aRest.map(({ s }) => key(s))
  const bKeys = bRest.map(({ s }) => key(s))
  const dp = lcsTable(aKeys, bKeys)
  const local = lcsPairs(aKeys, bKeys, dp)
  return local.map(([li, lj]) => [aRest[li].i, bRest[lj].i] as [number, number])
}

/**
 * Diff two recorded sessions step-by-step. Pairing prefers identical
 * `actionId` (same row written twice — rare across sessions but cheap to
 * exploit), then runs a tight LCS over `type::strategy::selector[:30]`,
 * and finally a loose LCS over `type` alone so a locator rewrite shows up
 * as `changed` instead of phantom add + remove.
 *
 * The result reports steps as `added` / `removed` when one side lacks a
 * pair, and as `changed` when a pair's locator or payload diverged. Two
 * paired steps with identical locator + payload appear only in `pairs`.
 */
export function diffSessions(a: RecordedAction[], b: RecordedAction[]): SessionDiff {
  // First pass: pair by actionId (cheap; usually empty across sessions).
  const aById = new Map(a.map((s, i) => [s.actionId, i] as const))
  const bById = new Map(b.map((s, i) => [s.actionId, i] as const))
  const aMatched = new Set<number>()
  const bMatched = new Set<number>()
  const idPairs: Array<[number, number]> = []
  for (const [id, i] of aById) {
    const j = bById.get(id)
    if (j !== undefined) {
      idPairs.push([i, j])
      aMatched.add(i)
      bMatched.add(j)
    }
  }

  // Pass 2 — tight LCS (type + strategy + selector prefix) over the tails.
  const tightAbsolute = lcsOnRemaining(a, b, aMatched, bMatched, tightKey)
  for (const [i, j] of tightAbsolute) {
    aMatched.add(i)
    bMatched.add(j)
  }

  // Pass 3 — loose LCS (type only) over what's still unmatched. Picks up
  // pairs where the locator was rewritten so we can report a `changed` entry
  // instead of an `added` + `removed` pair.
  const looseAbsolute = lcsOnRemaining(a, b, aMatched, bMatched, looseKey)

  const allPairs = [...idPairs, ...tightAbsolute, ...looseAbsolute].sort(([ai], [aj]) => ai - aj)
  const pairedA = new Set(allPairs.map(([i]) => i))
  const pairedB = new Set(allPairs.map(([, j]) => j))

  const changed: SessionDiffChangedEntry[] = []
  for (const [i, j] of allPairs) {
    const locatorChanged = !locatorMatches(a[i], b[j])
    const valueChanged = !payloadMatches(a[i], b[j])
    if (locatorChanged || valueChanged) {
      changed.push({
        actionId: b[j].actionId,
        previousActionId: a[i].actionId,
        locatorChanged,
        valueChanged,
      })
    }
  }

  const removed = a.filter((_, i) => !pairedA.has(i))
  const added = b.filter((_, j) => !pairedB.has(j))

  return { added, removed, changed, pairs: allPairs }
}

export interface SessionDiffSummary {
  added: number
  removed: number
  changed: number
  unchanged: number
}

export function summarizeDiff(diff: SessionDiff): SessionDiffSummary {
  return {
    added: diff.added.length,
    removed: diff.removed.length,
    changed: diff.changed.length,
    unchanged: diff.pairs.length - diff.changed.length,
  }
}
