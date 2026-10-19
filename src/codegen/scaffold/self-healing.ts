/**
 * Runtime self-healing helpers — single source of truth.
 *
 * These strings are written into the generated test project (`utils/locator.ts`,
 * `cypress/support/locator.js`), so the project does not depend on Recospec at runtime. Their
 * behaviour is covered by tests that execute exactly this source.
 */

/** How long the primary locator may be missing before the fallback that took over is reported. */
export const SELF_HEALING_PROBE_TIMEOUT_MS = 2000 as const

/**
 * Source emitted as `utils/locator.ts` in the Playwright scaffold.
 *
 * Playwright resolves locators lazily, so the helper cannot pick a winner up front. It returns
 * `primary.or(fallback…).first()` — whichever recorded locator matches at use time — and, in the
 * background, reports when the primary is gone and a fallback is carrying the step.
 */
export const PLAYWRIGHT_SELF_HEALING_TS = `import type { Locator, Page } from '@playwright/test';

/** How long the primary locator may be missing before the fallback that took over is reported. */
const PRIMARY_PROBE_TIMEOUT_MS = ${SELF_HEALING_PROBE_TIMEOUT_MS};

/**
 * Locator that matches the recorded element by its primary locator or, when that no longer
 * exists, by one of the fallbacks Recospec ranked below it. Pass the primary first.
 * A warning names the fallback in use, so the page object can be updated.
 *
 * @example
 *   get email() {
 *     return selfHealingLocator(this.page, [
 *       this.page.getByTestId('email'),
 *       this.page.getByLabel('Email'),
 *     ]);
 *   }
 */
export function selfHealingLocator(page: Page, candidates: Array<Locator | string>): Locator {
  const locators = candidates.map((c) => (typeof c === 'string' ? page.locator(c) : c));
  const [primary, ...fallbacks] = locators;
  if (!primary) {
    throw new Error('selfHealingLocator: no selectors provided');
  }
  reportHealing(primary, fallbacks);
  return fallbacks.reduce((either, next) => either.or(next), primary).first();
}

function reportHealing(primary: Locator, fallbacks: Locator[]): void {
  if (fallbacks.length === 0) return;
  primary
    .waitFor({ state: 'attached', timeout: PRIMARY_PROBE_TIMEOUT_MS })
    .catch(async () => {
      for (const fallback of fallbacks) {
        if ((await fallback.count()) > 0) {
          console.warn('[recospec] primary locator not found, using fallback ' + String(fallback));
          return;
        }
      }
    })
    .catch(() => undefined);
}
`

/**
 * Source emitted as `cypress/support/locator.js` in the Cypress scaffold.
 * Registers `cy.selfHealing(['#primary', '[data-testid="primary"]'])`.
 */
export const CYPRESS_SELF_HEALING_JS = `/**
 * cy.selfHealing(['#primary', '[data-testid="primary"]'])
 *
 * Yields the first selector that matches, primary first, retrying until one does. A warning
 * names the fallback when the primary selector is gone.
 */
Cypress.Commands.add('selfHealing', (selectors) => {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    throw new Error('cy.selfHealing: pass a non-empty array of selectors');
  }
  const firstMatch = () => selectors.find((selector) => Cypress.$(selector).length > 0);
  return cy
    .wrap(null, { log: false })
    .should(() => {
      if (!firstMatch()) {
        throw new Error('cy.selfHealing: none of the selectors matched: ' + selectors.join(', '));
      }
    })
    .then(() => {
      const used = firstMatch();
      if (used !== selectors[0]) {
        const message = 'primary selector ' + selectors[0] + ' not found, using fallback ' + used;
        Cypress.log({ name: 'selfHealing', message });
        console.warn('[recospec] ' + message);
      }
      return cy.get(used);
    });
});
`
