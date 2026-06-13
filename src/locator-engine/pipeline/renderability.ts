import type { LocatorStrategyName } from '@shared/types/locator'
import type { FrameworkId } from '@shared/types/generated'

/**
 * Which frameworks each strategy can be rendered for. The hard constraint is:
 * Playwright plus at least one other framework — a candidate that fails this
 * never enters the bundle, so codegen can never hit a silent dead end.
 *
 * Every current strategy renders everywhere (each adapter has a raw-selector
 * branch). The matrix exists as the seam for partially-supported strategies
 * (e.g. the future `layout` strategy, which Cypress cannot express) — those
 * declare their gaps here and the render layer emits an explanatory comment +
 * the best renderable fallback instead of silently degrading.
 */
const ALL: FrameworkId[] = ['playwright-ts', 'cypress', 'selenium-py', 'selenium-java']

const RENDERABILITY: Record<LocatorStrategyName, readonly FrameworkId[]> = {
  testid: ALL,
  'test-attr': ALL,
  'aria-label': ALL,
  'aria-labelledby': ALL,
  'role-name': ALL,
  label: ALL,
  text: ALL,
  id: ALL,
  css: ALL,
  xpath: ALL,
  composed: ALL,
  // Playwright/Cypress render full Date-parameter methods; Selenium renders a
  // pre-formatted-label parameter with an explanatory comment — parameterized
  // either way, so the matrix counts all four.
  template: ALL,
  // Attribute strategies are plain CSS selectors everywhere (Playwright also
  // has idiomatic getByPlaceholder / getByAltText / getByTitle).
  placeholder: ALL,
  alt: ALL,
  title: ALL,
  name: ALL,
  href: ALL,
  // Layout (spatial) locators: Playwright `:near()` + Selenium 4 relative
  // locators, but Cypress has no equivalent → render an unsupported comment.
  layout: ['playwright-ts', 'selenium-py', 'selenium-java'],
}

export function renderableFrameworks(strategy: LocatorStrategyName): readonly FrameworkId[] {
  return RENDERABILITY[strategy] ?? []
}

/** Constraint check: renderable to Playwright + at least one other framework. */
export function isRenderable(strategy: LocatorStrategyName): boolean {
  const frameworks = renderableFrameworks(strategy)
  return frameworks.includes('playwright-ts') && frameworks.length >= 2
}

/** Render-layer query: can this strategy be emitted for this framework? */
export function supportsFramework(strategy: LocatorStrategyName, framework: FrameworkId): boolean {
  return renderableFrameworks(strategy).includes(framework)
}
