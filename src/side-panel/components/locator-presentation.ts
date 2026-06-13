import type { LocatorStrategyName } from '@shared/types/locator'

/**
 * Re-exported from the shared, pure module so existing side-panel importers
 * (`StepList`, `LocatorDetail`) keep their import path. The tier logic itself
 * lives in `@shared/locator-quality` alongside the quality classifier so the
 * two stay in lockstep.
 */
export { scoreTier } from '@shared/locator-quality'

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
  composed: 'bg-accent-soft text-accent',
  template: 'bg-success-soft text-success',
  placeholder: 'bg-accent-soft text-accent',
  alt: 'bg-accent-soft text-accent',
  title: 'bg-bg-muted text-text-muted',
  name: 'bg-warning-soft text-warning',
  href: 'bg-warning-soft text-warning',
  layout: 'bg-danger-soft text-danger',
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
  composed:
    'Anchor + target chain — scoped under a stable container (testid / semantic role), so sibling churn outside the scope cannot break it.',
  template:
    'Parameterized locator — the data value (date / name) becomes a method parameter instead of being hardcoded, so the test works for any value.',
  placeholder:
    'Input placeholder text — Playwright getByPlaceholder; stable unless the placeholder copy changes (breaks under i18n).',
  alt: 'Image alt text — Playwright getByAltText; accessible and stable unless the alt copy changes.',
  title: 'Title attribute — Playwright getByTitle; tooltip text, moderately stable.',
  name: 'Form-control name attribute — stable identity for inputs the backend already keys on.',
  href: 'Link href path (query string stripped) — stable for navigation links.',
  layout:
    'Spatial relation (near / right-of an anchor) — last resort; Playwright :near() & Selenium relative locators only, unsupported in Cypress.',
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
