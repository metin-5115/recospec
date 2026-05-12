# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.1] — 2026-05-10

### Added

- **Live locator validation ("Test on Page")** — the side-panel's code preview
  now ships a primary "Test on Page" button that evaluates every recorded
  locator against the user's currently focused tab before they download the
  ZIP. Each row reports `matched` (1 hit), `multiple` (selector ambiguous), or
  `missing`, plus the strategy and selector. A "Show me" action flashes a
  green/amber overlay over the matched element (with a label and 1 s
  auto-dismiss); a "Use fallback" action one-clicks the top-scoring fallback
  into the step's primary slot via the existing `setStepLocator` pipeline,
  flipping `userOverridden=true` and reusing the same `STEP_UPDATED` round
  trip used by the locator picker. Iframes and shadow DOM are pierced via the
  recorded `frameContext.frameChain` / `shadowContext.hostChain`, mirroring
  the recording-time logic in `content/shadow-pierce.ts`. Cross-origin
  iframes (whose `contentWindow.document` is unreachable) surface as
  `cross-origin` instead of a misleading miss.
- New `shared/constants.ts` entries: `LOCATOR_VALIDATION_MAX_TARGETS` (100)
  caps single-run target count and surfaces a "Validated first 100 of N"
  hint in the panel; `LOCATOR_VALIDATION_HIGHLIGHT_DURATION_MS` (1000) tunes
  the on-page overlay flash.
- New message contract: `VALIDATE_LOCATORS` (UI → BG), `VALIDATE_LOCATORS_RUN`
  (BG → CS), `LOCATOR_VALIDATION_RESPONSE` (CS → BG), `LOCATOR_VALIDATION_RESULT`
  (BG → UI), plus `HIGHLIGHT_LOCATOR` / `HIGHLIGHT_LOCATOR_ON_PAGE` for the
  Show-me overlay. Origin-mismatch detection compares the recorded
  `session.startUrl` origin to the active tab's URL and tags every result
  with `urlMismatch: true` so the panel can render an "Active tab no longer
  matches the recorded origin" warning.

- **Test data parameterization** — sensitive form fields (password, token,
  secret, api key, email; plus `autocomplete=current-password|new-password|
one-time-code|email|username`) are auto-detected and rendered as env-var
  lookups instead of hardcoded literals. Each adapter uses its idiomatic
  helper:
  - **Playwright TS** — `process.env.PLAYFORGE_PASSWORD ?? "change-me"`
  - **Cypress JS** — `Cypress.env("password") || "change-me"`
  - **Selenium Python** — `os.environ.get('PLAYFORGE_PASSWORD', 'change-me')`
  - **Selenium Java (TestNG)** — `System.getenv().getOrDefault("PLAYFORGE_PASSWORD", "change-me")`
- New side-panel **Test Data** card lists every parameterized field with an
  inline editor for parameter name, default value, secret toggle, and
  "use env var" checkbox. Manual overrides flow through `CODE_GENERATE` via
  the new `testData: TestDataConfig` payload.
- Adapter scaffolds gain fixture/env templates when env-var params exist:
  `.env.example` (Playwright), `cypress.env.json.example` (Cypress),
  `.env.example` + `python-dotenv` in `conftest.py` (Selenium Py), and
  `src/test/resources/test-data.properties.example` (Selenium Java).
- `IRElementSnapshot` now carries `fieldName` and `autocomplete` to feed the
  detector; `InferredMethod` gains a parallel `paramSecret: boolean[]` so
  page-object methods can be reasoned about as "this method takes a secret".
- New `shared/constants.ts` entries: `SENSITIVE_FIELD_PATTERNS`,
  `SENSITIVE_AUTOCOMPLETE_VALUES`, `SECRET_PARAM_DEFAULT_VALUE`, `ENV_VAR_PREFIX`.
- `logger.ts` redacts any property whose key matches the sensitive patterns
  (`password|secret|token|apiKey|…`) before forwarding to console — secrets
  never leak through the dev-mode logger.

- **Smart auto-wait detection** — clicks that trigger network activity or
  introduce a spinner-like node within 500 ms now emit a dedicated `wait` IR
  step. Reasons currently inferred: `networkidle` (one or more `fetch`/XHR
  responses observed in the post-click window) and `spinner` (a node matching
  `[role=progressbar]`, `.spinner`, `.loading`, or `[aria-busy=true]` is
  attached to the DOM, or an existing element flips `aria-busy` to true).
  Spinner waits carry the spinner element's locator; the spinner heuristic
  takes precedence over networkidle when both fire.
- New IR surface: `IRActionType` gains `'wait'`; new `IRWaitReason` union
  (`networkidle | spinner | element-hidden | element-visible`) and
  `IRWaitInfo { reason, timeoutMs }` carried on `IRStep.wait`. The new
  `wait-normalizer` is the single point of conversion from a recorded `wait`
  action to an IR step.
- All four adapters render the wait idiomatically:
  - **Playwright TS** — `await page.waitForLoadState('networkidle')` for
    networkidle; `await locator.waitFor({ state: 'hidden', timeout })` for
    spinners. Page-object methods use `this.<element>.waitFor(...)`.
  - **Cypress JS** — `cy.intercept('**/*').as('netReq'); cy.wait('@netReq')`
    for networkidle; `cy.get(...).should('not.exist')` for spinners.
  - **Selenium Python** — `WebDriverWait(...).until(EC.invisibility_of_element_located(...))`
    for spinners; networkidle degrades to a `presence_of_element_located` body
    wait with an explanatory comment (no native equivalent).
  - **Selenium Java (TestNG)** — `wait.until(ExpectedConditions.invisibilityOfElementLocated(...))`
    for spinners; same body-presence fallback for networkidle.
- Side panel **Auto-detect waits** toggle (default ON) lives next to the
  network mocks toggle and persists in `localStorage`. When off, recorded
  `wait` actions are stripped from the IR before code generation. Wait steps
  render in the recording list with an Hourglass icon and a `Wait for <reason>`
  label; `StepEditModal` exposes a Wait timeout (ms) field for tweaking the
  rendered `timeoutMs`.
- `CODE_GENERATE` message now accepts an optional `autoWaitEnabled` flag,
  threaded through `handleCodeGenerate` → `generate(...)`.
- New constants in `shared/constants.ts`: `AUTO_WAIT_NETWORK_DEBOUNCE_MS`
  (500 ms detection window), `AUTO_WAIT_DEFAULT_TIMEOUT_MS` (10 s timeout),
  `SPINNER_SELECTORS` (the four matchers above).
- Benchmark fixture `benchmarks/fixtures/spinner-modal/` exercising a modal
  with the four spinner patterns to keep locator scoring stable in the face
  of `.spinner`/`.loading` class names.

- **Edit, reorder and override locators on recorded steps** — the recording panel
  is no longer read-only after capture. Each step has a drag handle (keyboard- and
  pointer-accessible via `@dnd-kit`) for reordering and a Pencil icon that opens
  `StepEditModal`. The modal exposes the action's value (fill), key (keypress) and
  delay (ms), plus a Locator tab listing every scored candidate from
  `LocatorBundle.allCandidates` — picking one promotes it to primary and demotes
  the previous primary into the fallbacks list. Overridden steps surface a small
  `✏ overridden` pill in the list. Reorder/edit/delete only enable while the
  session is paused or stopped; they refuse during active recording. After any
  modification the code preview gains a `Steps modified — regenerate code to apply
changes` banner with a `Re-generate` button.
- `RecordedAction.target.allCandidates?: ScoredLocator[]` and
  `RecordedAction.target.userOverridden?: boolean` — persisted on the action so a
  manually picked locator survives reloads.
- New messages: `STEPS_REORDERED`, `STEP_UPDATED`, `STEP_DELETED` (UI →
  background); `STEPS_SYNCED` (background → UI). Reorder/update/delete dispatch
  optimistic UI updates and the background reconciles via `STEPS_SYNCED`.
- `action-repo.reorderActions`, `action-repo.updateAction`, `action-repo.deleteAction`
  — transactional Dexie operations that keep `sequenceNumber` contiguous (0..n-1).
- **Rich locator detail in step list** — every step now shows the strategy
  badge, primary score (color-coded: green ≥80, amber ≥50, red <50), and a
  one-line element snapshot (`tag · "text" · #id`). Clicking the locator opens
  a popover that lists every strategy the engine considered with its score and
  match count, plus an `Element snapshot` card. Frame-chain selectors render as
  readable JSON instead of a `<tag>` placeholder.
- `LocatorBundle.allCandidates: ScoredLocator[]` — every scored candidate the
  engine produced, sorted by score descending. Surfaced for the new locator
  detail UI.
- `ScoredLocator.matchCount: number` — number of DOM elements the candidate
  resolves to (1 = unique). Best-effort: defaults to 1 for strategies whose
  selector is not a CSS query (`role-name`, `text`, `xpath`).

### Fixed

- **Locator engine** — semantic domain ids with short numeric suffixes (`BVD-135`,
  `order-1234`, `ticket-789`) are no longer misclassified as dynamic. The trailing
  digit-suffix threshold is raised from 3+ to 5+ digits via
  `MIN_DYNAMIC_ID_DIGIT_SUFFIX`. The `IdStrategy` now produces stable id locators
  for these elements instead of falling through to css/xpath.

### Changed

- `RecordedAction.target.primaryLocator` and `fallbackLocators` are typed as
  `ScoredLocator` (was `Locator`), preserving the engine's score and matchCount
  through to the UI.
- `score(...)` accepts an optional precomputed match count to avoid double
  `querySelectorAll` calls — the engine now computes match count once per
  candidate and reuses it for both stability scoring and the UI.

## [0.5.0] - 2026-05-08

End of Phase 2 — "Akıllılaşma". Same recording exports to two frameworks (Playwright TS,
Cypress JS) with self-healing locators, network mocks, and visual regression baked in.

### Added

- **Cypress JavaScript adapter** with Page Object Model output, `cy.findByRole` /
  `cy.findByLabelText` via `@testing-library/cypress`, and ZIP scaffold (`cypress.config.js`,
  `cypress/support/`, `package.json`).
- **Adapter SDK** — `FrameworkAdapter` interface + `ADAPTER_REGISTRY` so new frameworks
  register through `registerAdapter(...)`. Side panel framework picker switches between
  Playwright TS and Cypress; selection persists in `localStorage`.
- **Self-healing locators** — IR carries `IRFallback[]` and `IRElementSnapshot` per
  element. Each generated locator gets an idiomatic `// Fallbacks: …` comment, and
  scaffolds ship a runtime helper that walks the chain at execution time:
  - Playwright: `utils/locator.ts` — `selfHealingLocator(page, primary, fallbacks, snapshot)`
  - Cypress: `cypress/support/locator.js` — `cy.selfHealing(primary, fallbacks, snapshot)`
- **Method inference v2** — 10 patterns (search, login, register, submitForm, fillForm,
  acceptAndSubmit, navigateFromMenu, selectFromMenu, openItem, confirmAction + fallback)
  with parameter-type inference (`number`, `boolean`) from `IRElement.inputType`. In-page
  method-name collisions resolve via numeric suffix; default naming uses `click<Name>` /
  `fill<Name>` / `press<Key>` / `verify<Name>`. Side panel `MethodPreview` lists inferred
  methods per page and lets you rename them inline.
- **Network request capture** — MAIN-world content script (`network-proxy.ts`) wraps
  `window.fetch` and `XMLHttpRequest`; ISOLATED CS forwards captured requests via
  `playforge:network` CustomEvent → background `EVENT_CAPTURED`. Response bodies capped
  at `NETWORK_BODY_MAX_BYTES` (50 KB). No new permissions required.
- **Network mock generation** — opt-in `Include mocks for captured network requests`
  checkbox emits Playwright `page.route(... route.fulfill(...))` blocks. JSON bodies
  serialize via live `JSON.stringify(...)`; text bodies as string literals.
- **Visual regression assertions** — content-script suggester offers a "Screenshot match"
  per element; background uses `chrome.tabs.captureVisibleTab` to attach a thumbnail.
  `AssertionBuilder` shows the thumbnail, snapshot name input, and threshold slider.
  Adapters emit:
  - Playwright: `await expect(...).toHaveScreenshot('name.png', { threshold })`
  - Cypress: `cy.matchImageSnapshot('name', { failureThreshold, failureThresholdType: 'percent' })`
    ZIP scaffolds wire the dependency (`cypress-image-snapshot` plugin/command) and snapshot
    baseline directories (`tests/scenario.spec.ts-snapshots/`, `cypress/screenshots/`).
- **UI design system pass** — Inter font, lucide-react icons, design tokens, dark mode,
  gradient header, pill tabs, gradient CTA, modal animations with `prefers-reduced-motion`
  guard, polished empty/loading states across StepList, SessionList, FrameworkPicker,
  AssertionBuilder, CodePreview, MethodPreview.

### Performance

- Locator engine single evaluate p99 **1.33ms** on a small form (target <5ms).
- Locator engine single evaluate on a 1000-element DOM **max 130ms** (target <500ms).
- Build size **~478 KB** uncompressed across all dist assets (target <500 KB).

### Tests

- 248 unit tests across 30 files passing.
- Coverage budgets met on `locator-engine` and `codegen` modules.

### Changed

- `Generate` flow now sends `methodRenames` map (`Record<"PageClass.oldName", string>`)
  with `CODE_GENERATE`; codegen pipeline applies renames via `applyRenames`.
- `AssertionType` extended with `screenshot`; `AssertionSpec` and `AssertionDetail` now
  carry `name` and `threshold`.

### Known limitations

- Selenium Python (Pytest) and Selenium Java (TestNG) adapters are not yet shipped — they
  remain on the Phase 3 roadmap.
- Closed shadow roots are flagged but not pierced.
- Demo GIF in README is still a placeholder.

## [0.1.0] - 2026-05-06

### Added

- Chrome Manifest V3 extension with popup and side panel UI
- Event recording: captures click, fill, navigate, keypress, scroll, hover actions
- Smart locator engine with 9 strategies (priority order): test-id, test-attributes,
  aria-label, role+name, label, text, id, CSS selector, XPath
- Locator stability scoring formula: uniqueness×0.4 + semanticStrength×0.3 +
  stability×0.2 + depth×0.1
- Dynamic class/ID detector — rejects css-hash, MuiButton-root-273 style tokens
- Three-stage code generation pipeline: Normalizer → Planner → Adapter
- Playwright TypeScript adapter with Page Object Model output
- Method inference: login(), search(), submitForm() patterns auto-detected
- IndexedDB persistence via Dexie — survives service worker restarts
- Recording state indicator (REC / IDLE badge) in popup, side panel, and toolbar
- Step list with action icons, locator strategy badge on hover, and per-step delete
- Empty state with hint when no steps have been recorded
- Code preview with syntax-highlighted output, Copy to Clipboard, and Download .ts
- Error display and automatic retry (up to 3 attempts) for code generation failures
- Shadow DOM support: open shadow roots pierced, closed roots flagged with warning
- Iframe support: frame URL and name tracked, frameLocator() emitted in output
- Assertion builder: visible, text, value, attribute assertions via hover + click
- Session management: list, rename, delete, pause/resume, multi-tab sessions
- JSON export of raw recorded actions with metadata
- ZIP export: pages/, tests/, playwright.config.ts, package.json, README scaffold
- CI/CD: GitHub Actions workflows for PR checks, E2E on main, and GitHub Release on tag
- Playwright E2E test infrastructure with extension loading helpers
- Unit test coverage ≥ 85% on locator-engine and codegen modules
