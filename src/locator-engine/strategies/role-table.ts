export const IMPLICIT_ROLE_TABLE: ReadonlyArray<{ selector: string; role: string }> = [
  { selector: 'button', role: 'button' },
  { selector: 'input[type="button"]', role: 'button' },
  { selector: 'input[type="submit"]', role: 'button' },
  { selector: 'input[type="reset"]', role: 'button' },
  { selector: 'input[type="image"]', role: 'button' },
  { selector: 'a[href]', role: 'link' },
  { selector: 'input[type="checkbox"]', role: 'checkbox' },
  { selector: 'input[type="radio"]', role: 'radio' },
  { selector: 'input[type="range"]', role: 'slider' },
  { selector: 'input[type="number"]', role: 'spinbutton' },
  { selector: 'input[type="search"]', role: 'searchbox' },
  { selector: 'input[type="email"]', role: 'textbox' },
  { selector: 'input[type="url"]', role: 'textbox' },
  { selector: 'input[type="tel"]', role: 'textbox' },
  { selector: 'input[type="text"]', role: 'textbox' },
  // NB: `input[type="password"]` has NO corresponding ARIA role — `getByRole`
  // (Playwright/Testing-Library) never matches it, so a `role-name` locator
  // would fail at runtime. It is deliberately absent here so the engine falls
  // through to `label` / id / css, which DO resolve a password field.
  // The catch-all below is narrowed to typeless inputs (which default to text);
  // every text-like type is already enumerated above, so password/hidden/file
  // and other roleless types no longer fall through to `textbox`.
  { selector: 'input:not([type])', role: 'textbox' },
  { selector: 'select[multiple]', role: 'listbox' },
  { selector: 'select', role: 'combobox' },
  { selector: 'textarea', role: 'textbox' },
  { selector: 'h1', role: 'heading' },
  { selector: 'h2', role: 'heading' },
  { selector: 'h3', role: 'heading' },
  { selector: 'h4', role: 'heading' },
  { selector: 'h5', role: 'heading' },
  { selector: 'h6', role: 'heading' },
  { selector: 'nav', role: 'navigation' },
  { selector: 'main', role: 'main' },
  { selector: 'aside', role: 'complementary' },
  { selector: 'dialog', role: 'dialog' },
  { selector: 'form', role: 'form' },
  { selector: 'img', role: 'img' },
  { selector: 'table', role: 'table' },
  { selector: 'thead', role: 'rowgroup' },
  { selector: 'tbody', role: 'rowgroup' },
  { selector: 'tr', role: 'row' },
  { selector: 'th', role: 'columnheader' },
  { selector: 'td', role: 'cell' },
  { selector: 'ul', role: 'list' },
  { selector: 'ol', role: 'list' },
  { selector: 'li', role: 'listitem' },
]

/**
 * CSS selector matching every element that carries `role` — explicitly via the
 * `role` attribute or implicitly via the host-language table above. Used by
 * the strategy-aware match counter to pre-filter candidates before the (more
 * expensive) accessible-name comparison.
 */
export function selectorForRole(role: string): string {
  const implicit = IMPLICIT_ROLE_TABLE.filter((e) => e.role === role).map((e) => e.selector)
  return [`[role="${role}"]`, ...implicit].join(', ')
}
