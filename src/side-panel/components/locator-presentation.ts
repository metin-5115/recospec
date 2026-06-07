import type { LocatorStrategyName } from '@shared/types/locator'

/**
 * Tailwind class string for each locator strategy's badge. The colour
 * encodes how resilient the strategy is in practice — `testid` reads as
 * "safe", `xpath` as "fragile". Tokens are sourced from `theme.css`.
 */
export const STRATEGY_BADGE_CLASS: Record<LocatorStrategyName, string> = {
  testid: 'bg-success-soft text-success',
  'test-attr': 'bg-success-soft text-success',
  'aria-label': 'bg-accent-soft text-accent',
  'aria-labelledby': 'bg-accent-soft text-accent',
  'role-name': 'bg-accent-soft text-accent',
  label: 'bg-bg-muted text-text-muted',
  text: 'bg-warning-soft text-warning',
  id: 'bg-warning-soft text-warning',
  css: 'bg-warning-soft text-warning',
  xpath: 'bg-danger-soft text-danger',
}

/**
 * One-line explanation surfaced as a tooltip and inline rationale in
 * the locator detail panel. Helps users understand why one strategy
 * was chosen over another without learning the engine internals.
 */
export const STRATEGY_HELP_TEXT: Record<LocatorStrategyName, string> = {
  testid:
    'Dedicated test attribute (data-testid / data-cy) — most resilient against UI, copy, and style changes.',
  'test-attr':
    'Custom test attribute (data-test / data-qa / data-automation) — stable as long as the team keeps the attribute.',
  'aria-label':
    'Accessible label — stable across themes and copy edits, breaks only if a11y attributes change.',
  'aria-labelledby':
    'Accessible label reference — same resilience as aria-label, indirected through another element.',
  'role-name':
    'ARIA role combined with accessible name — aligns with how assistive tech finds the element.',
  label: 'Associated <label> text — stable unless the visible label copy changes.',
  text: 'Visible text content — convenient but brittle: any copy edit or i18n change breaks it.',
  id: 'Element id — fine for static apps, fragile in SPAs where ids are auto-generated.',
  css: 'Structural CSS selector — works today but couples the test to current DOM structure.',
  xpath: 'XPath fallback — last resort; the most likely to break on any DOM change.',
}

/**
 * Maps a stability score (0–100) to a human-readable tier and the
 * Tailwind text colour used to highlight the score in the UI. The
 * thresholds match the existing colour breakpoints inside
 * `LocatorDetail` so the badge and the bar agree.
 */
export function scoreTier(score: number): {
  label: 'Strong' | 'Medium' | 'Weak'
  textClass: string
  bgClass: string
} {
  if (score >= 80) return { label: 'Strong', textClass: 'text-success', bgClass: 'bg-success' }
  if (score >= 50) return { label: 'Medium', textClass: 'text-warning', bgClass: 'bg-warning' }
  return { label: 'Weak', textClass: 'text-danger', bgClass: 'bg-danger' }
}

/**
 * Status-code colour for a captured network step. 2xx is healthy, 4xx
 * is a client-side problem worth flagging, 5xx is a server failure that
 * usually means the recording should be re-taken. Returns the inline
 * Tailwind class only — layout is unchanged.
 */
export function networkStatusClass(status: number | undefined): string {
  if (typeof status !== 'number') return 'text-text-subtle'
  if (status >= 500) return 'text-danger'
  if (status >= 400) return 'text-warning'
  if (status >= 200) return 'text-success'
  return 'text-text-subtle'
}
