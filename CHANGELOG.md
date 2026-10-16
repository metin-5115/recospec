# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Test runner pinned back to Vitest 3.2** — the 0.8.0 bump to Vitest 4 changed how v8 reports
  branch coverage (the same suite dropped from 81.7% to 69.2%) and turned `pnpm test:ci` red on
  the 75% threshold. `tinypool` is overridden to the patched 2.x. `pnpm audit` is down to 3
  dev-only findings (`vitest`/`@vitest/mocker` path traversal fixed only in Vitest 4.1.11+, and
  `braces` via `@vscode/vsce`, which has no patched release); production dependencies report none.

## [0.8.0] — 2026-10-16

### Added

- **Extension icons and Chrome 114 floor** — 16/32/48/128px "R" icons generated from
  `branding/recospec-icon.svg` (`pnpm exec node scripts/generate-icons.mjs`) are wired into
  `icons` and `action.default_icon`; `minimum_chrome_version` is `114` (Side Panel API).
  Demo pages are no longer web-accessible to every site.
- **Publishable `recospec` CLI package** — `cli/` plus `pnpm package:cli` build, verify that every
  runtime import is declared, and `npm pack` the CLI. `recospec --version` now reads the package
  version at build time.
- **Claude prompt preview in the side panel** — a collapsible "Claude prompt" card
  (next to Generate / JSON for CLI) renders the XML coding prompt for the
  active recording with a redaction toggle, **Copy** and **Download** buttons.
- **Richer interaction capture and codegen** — the recorder now records
  `<select>` choices, `<textarea>` input, checkbox/radio toggles
  (`check` / `uncheck`) and double clicks. The IR gained `select`, `check`,
  `uncheck`, `hover` and `dblclick` steps, rendered idiomatically by all four
  adapters (`selectOption` / `.select()` / `Select(...).select_by_value` /
  `new Select(...).selectByValue`, `setChecked` / `check()` / `is_selected()`
  guards, `hover` / `trigger('mouseover')` / `ActionChains` / `Actions`).
  Boolean-parameterised toggles collapse to `setChecked(param)`; BDD
  feature/step output covers the new steps.
- **Cypress network mocks** — "Include network mocks" now emits
  `cy.intercept({ method, pathname, query }, { statusCode, headers, body })`
  blocks, registered at the start of the test / page-object method (an
  intercept placed after the click would miss the request).
- **Selenium iframes and open shadow roots** — Python switches into the frame
  chain (and back to the top document) around framed steps and rebinds
  `driver`/`wait` to the `ShadowRoot` for shadow steps; Java uses
  `enterFrames()` and a generated nested `ShadowBy`. Previously only a
  WARNING comment was emitted and such steps failed at run time.
- Selenium test output lists the network requests it cannot mock instead of
  silently ignoring the "Include network mocks" option.
- **Selenium visual regression** — screenshot assertions now compare against a
  baseline (`screenshots/<name>.png`, recorded on the first run) through a
  generated `_assert_screenshot()` (Pillow) / `assertScreenshot()` (JDK
  `ImageIO`) helper instead of leaving a `TODO` stub.

### Changed

- **Prompt negative-scenario rule** — when a flow has sensitive parameters, the prompt tells
  Claude to derive deliberately invalid values from the env var for error cases instead of reusing
  the valid credentials the redacted value maps to.
- Dependencies: `vitest` and `@vitest/coverage-v8` 4.1, `postcss` 8.5.30; in-range updates of the
  whole toolchain (`@vscode/vsce`, `@babel/*`, `@crxjs/vite-plugin`, `eslint`, `playwright` …) cut
  `pnpm audit` from 58 findings to 1. The remaining one (`braces`, via `@vscode/vsce`) has no patched
  release and is dev-only; production dependencies report none.
- **`recospec prompt` now emits an XML-tagged coding prompt** — the Markdown
  report is replaced by a `<recospec_prompt>` document: recorded data first
  (`scenario`, `pages` with `<locator>`/`<fallback>` per element, ordered
  `flow`, `network_mocks`, `secrets`, `fragility_hints`) and the task last
  (`instructions` with framework-specific `deliverables`, rules, verification
  and output format). Slash / CLAUDE.md / plain modes keep their wrappers.
  Redaction placeholders changed from `<REDACTED:X>` to `[REDACTED:X]` so they
  stay XML-safe.
- **Internal tech-debt pass** — shared indent / slug / feature-file /
  assertion helpers replace per-adapter copies, the Playwright adapter is split
  into locator / step / page-object / scenario / scaffold modules, and
  replay / validation timeouts moved to `shared/constants`. Generated output is
  unchanged.
- The service-worker `__recospecSeed` test hook is now only present in a
  `pnpm build:e2e` build, no longer in the shipped extension.
- `@types/react` / `@types/react-dom` aligned to React 18; redundant
  `@types/jszip` removed.

### Fixed

- **VS Code extension no longer fails to activate without Playwright** — the bundle required
  `@playwright/test` at the top level, so a machine without it broke every command. Playwright is
  now resolved lazily (workspace, extension folder, global npm root) when `Record Flow` starts, and
  a missing install or Chromium download shows the exact command with _Copy_ / _Open terminal_.
- **CLI runtime dependency** — `@cucumber/gherkin` moved to `dependencies`; an installed CLI
  could not load without it.
- **Element names for testid locators** — selectors stored as `[data-testid="x"]` produced names
  such as `dataTestidSignIn`; the attribute value is now unwrapped (`signIn`).
- A checkbox click used to record a `click` **plus** a bogus `fill` with value
  `on`; it is now a single `check` / `uncheck` step.
- A label that forwards its click to a checkbox no longer records twice.
- The two `click` events a browser fires before a `dblclick` are collapsed
  into the one `dblclick` step instead of replaying three clicks.
- Previously unsupported recorded actions (`select`, `hover`, `dblclick`, …)
  were silently dropped by the normalizer.
- Attribute values containing `"`, `\` or a newline produced invalid CSS /
  XPath selectors (and XPath values were wrapped with `JSON.stringify`, whose
  `\"` escape does not exist in XPath 1.0). All strategies, the iframe frame
  chain and the resolver now share `shared/selector-escape`.
- Elements inside an open shadow root got no locator at all: the engine judged
  candidates against `document`, whose queries never enter a shadow root.
  Candidates are now resolved against the element's own root.
- BDD step definitions: default-named methods (`click…`, `fill…`, `press…`,
  `verify…`) all shared one pattern (`I verify the {string}`), so every step
  ran the first method and with the wrong argument count. Each subject now
  has its own pattern, parameters the pattern has no placeholder for (e.g.
  `acceptAndSubmit(true)`) are passed as literals, and unhandled steps no
  longer emit a silent `TODO` (no-op for wait/network, an explicit error
  otherwise).
- The Selenium Java scenario dropped page-level screenshot assertions
  entirely ("no element" early return).
- The CSS strategy stopped at the first applicable attribute (a radio group's
  `name`, `type="text"`) even when it was shared; it now falls through to
  classes and a positional path unless the attribute selector is unique.
- The dynamic-class detector now recognises CSS Modules, Emotion `e…0`
  classes, Angular encapsulation / form-state classes and Svelte scoped
  classes.

## [0.7.0] — 2026-05-16

### Added

- **Recospec VS Code extension (companion)** — a separate marketplace-ready
  bundle that brings the **record → apply → Claude prompt** workflow into
  the editor. Builds via `pnpm build:vscode` (Vite SSR + lib mode → single
  CJS file at `vscode-extension/dist/extension.cjs`, ~2.16 MB). Packaged
  via `pnpm package:vscode` (wraps `@vscode/vsce`) into
  `releases/recospec-0.7.0.vsix`.
  - **`Recospec: Record Flow…`** — launches Chromium with the Recospec
    Chrome extension pre-loaded (`@playwright/test` `launchPersistentContext`,
    `--load-extension=<vscode-ext>/chrome-ext`, `headless: false` for MV3
    SW lifecycle). Notification with "Stop & Apply" / "Cancel" races
    against `context.on('close')` so an early browser close cannot hang
    the wait. On stop, the recording bridge calls
    `worker.evaluate(__recospecExport())` on the Chrome ext service
    worker to pull the latest session as a `JsonExportPayload`; the JSON
    lands in `<workspace>/.recospec/sessions/` and is fed straight into
    the Output Picker. Empty recordings surface a clean
    "No steps recorded" info message.
  - **Output Picker webview** — `src/vscode-ext/output-picker-html.ts`
    renders a single self-contained HTML doc with strict CSP
    (`default-src 'none'`, `script-src 'nonce-<per-load-uuid>'`,
    `style-src ${cspSource} 'unsafe-inline'`). Checkboxes for **test
    code**, **Claude prompt** (slash / `CLAUDE.md` block / standalone
    `prompts/<slug>.md`), **BDD output**, **network mocks** (auto-disabled
    when no network steps were captured), and **redact sensitive
    values**. Server-side `sanitizeChoices` clamps every flag to the
    actual capabilities of the session + adapter so a tampered webview
    cannot smuggle a forbidden combo. `Esc` cancels, `Ctrl+Enter`
    applies.
  - **Conflict reporter (VS Code flavour)** — `apply-json.ts` reuses the
    pure `ConflictReporter` contract (`@codegen/apply/conflict-reporter`)
    and provides a QuickPick-backed reporter with Merge / Overwrite /
    Skip / Write `.new` / Show diff. The diff option opens
    `vscode.diff` between the existing file and an untitled buffer
    holding the incoming content.
  - **Recordings tree view** — activity-bar view container with the
    Recospec sidebar icon (`icons/recospec-sidebar.svg`, monochrome
    `currentColor` so it inherits theme tinting). Items list newest-
    first by mtime; descriptions surface `<stepCount> steps · <date>`.
    Click → re-apply via the Output Picker. Welcome view points users
    at `Recospec: Record Flow…` when the sessions dir is empty. A
    `vscode.workspace.createFileSystemWatcher` keeps the tree fresh
    across record / delete cycles.
  - **`Recospec: Apply Existing JSON…`** + **`Recospec: Render Claude
Prompt…`** + **`Recospec: Init Project…`** static commands wrap the
    existing `runAdd` / `runPrompt` / `runInit` CLI functions through a
    shared `applyJsonAtPath` helper. Framework is resolved silently from
    `.recospecrc.json` → marker-file detection → QuickPick.
  - **Status bar** — right-aligned `$(record) Recospec` indicator that
    flips to `$(sync~spin) Recospec: <task>` during commands and
    appends the resolved framework label when one is detected.
  - **Bundled Chrome extension** — `vite.config.vscode.ts` ships a
    `closeBundle` plugin that mirrors `dist/` (Chrome ext build) into
    `vscode-extension/chrome-ext/` so the Record command can launch
    Chromium without a separate install. Missing `dist/` triggers a
    loud build-time warning + a `BundledExtensionMissingError` at
    runtime with the exact remediation command.
- **`EXPORT_REQUEST` / `EXPORT_RESPONSE` message types** in
  `src/shared/types/messages.ts` and a `case 'EXPORT_REQUEST'` in
  `src/background/message-router.ts`. The real path used by the VS Code
  host calls the new `handleExportRequest` (`src/background/export-handler.ts`)
  directly via the service-worker global
  `globalThis.__recospecExport`, because `chrome.runtime.sendMessage`
  cannot deliver a message to the sender. The handler reads the most-
  recently-stopped session (or a specific id) from Dexie and returns
  `buildJsonExport(session, actions)` — returning `null` when no
  actions are captured so the orchestrator surfaces a friendly
  "No steps recorded" message instead of an empty file.

### Changed

- **`runAdd` opens a `ConflictReporter` seam** — `src/cli/commands/add.ts`
  accepts an optional reporter and defaults to the existing terminal
  prompts reporter. The new `createTerminalReporter` export keeps the
  CLI's `prompts` dependency private to the CLI path so non-CLI hosts
  (the VS Code extension is the first; future web playground next)
  never pay the import cost.

### Fixed

- **Locator engine — framework-internal auto-generated ID detection**.
  `src/locator-engine/scoring/dynamic-detector.ts` now rejects
  Bootstrap Vue (`__BVID__N`, `__BV_tab__N`), Angular Material / MDC /
  CDK (`mat-input-3`, `mdc-floating-label-12`, `cdk-overlay-42`),
  Vuetify (`v-input-3`), jQuery UI (`ui-id-42`), Lit (`lit-element-3`),
  and bare double-underscore tails (`BVID__517`). Detection is
  structural — the digit-suffix threshold stays at 5 so semantic IDs
  (`ticket-789`, `order-1234`, `BVD-135`) still pass. 13 new regression
  tests cover the new patterns and the negative guards (`user_id_1`,
  `_private_field_2`, `v-2` remain static). Total tests **674 / 674**.

### Packaging

- New `pnpm package:vscode` script — wraps `@vscode/vsce` via a
  small Node driver (`scripts/package-vscode.mjs`) so the same command
  works on cmd.exe / PowerShell / bash. The driver enforces that
  `pnpm build` and `pnpm build:vscode` ran first (and that the
  `chrome-ext/` mirror is populated) before invoking `vsce package`,
  then emits `releases/recospec-<version>.vsix`.
- New `releases/` directory holds the committed VSIX for tagged
  releases. The CI tag pushes the file alongside the source tag so
  install-from-VSIX works without re-running the toolchain.

## [0.6.0] — 2026-05-13

### Added

- **`recospec` CLI** — a Node bin that applies a recorded JSON export onto an
  existing test project without producing the framework scaffold. Shipped via
  the same npm package (`bin: { recospec: "dist/cli/index.js" }`) and built
  with a dedicated `vite.config.cli.ts` (SSR/lib mode, single ESM bundle,
  `~164 KB` uncompressed).
  - `recospec add <json> [projectDir]` renders page objects + the scenario
    file through the matching adapter and writes them into the target
    project. Adapters are loaded via side-effect imports so all four register
    themselves into `ADAPTER_REGISTRY` at startup.
  - `recospec init [projectDir]` writes a `.recospecrc.json` so subsequent
    `add` calls skip framework detection. Honours `--framework` / `--bdd`.
  - `--bdd` reuses the existing `renderBddFeature` / `renderBddSteps`
    adapter hooks; the routing table mirrors `zip-export.ts/resolveZipPath`
    so feature + step files land in the same idiomatic locations the
    extension's ZIP export uses.
- **AST-aware mergers** — on every conflict the CLI prompts `m/o/s/r/d`
  (merge/overwrite/skip/rename/diff). The diff option prints a unified diff
  and re-prompts. Merge implementations per kind:
  - `src/cli/merge/ts-page-object.ts` — `@babel/parser` + `traverse` +
    `generator`. Locates the first exported class, appends only members
    (methods, getters, properties) whose name doesn't already exist, dedupes
    imports by source. Existing method bodies are never overwritten.
  - `src/cli/merge/py-page-object.ts` — `spawnSync(python, '-c', 'import
ast; …')` extracts canonical class-member names from each file. When no
    Python interpreter is on PATH it falls back to a regex extractor
    (`def …(`, `CONST = `). Imports are deduped by exact line.
  - `src/cli/merge/java-page-object.ts` — tokenizing balanced-brace walker
    locates the outer `public class …` body (no javaparser; the npm port is
    unmaintained). Inner classes trigger an `overwrite ↔ skip` prompt rather
    than risking brace-counting collisions. Methods and `@FindBy`-annotated
    fields are appended by name; imports are deduped.
  - `src/cli/merge/feature-file.ts` — parses with `@cucumber/gherkin` to
    collect existing scenario titles, then walks the incoming file
    line-by-line and appends scenarios whose title (case-insensitive) is
    new. The single `Feature:` header is preserved — duplicates are
    impossible by construction.
- **Framework auto-detection** — `src/cli/detect-framework.ts` walks
  `pom.xml` (selenium-java artifact), `requirements.txt` (`selenium` line),
  and `package.json` `devDependencies` (`@playwright/test`, `cypress`) in
  descending specificity. Returns the marker file as `source` so the
  console output explains its pick.
- **`.recospecrc.json`** — `src/cli/config-loader.ts` reads the rc into a
  typed `RecospecRc`. The rc currently pins `framework` and the default
  `bdd` value; `paths` is reserved for P7.3.
- **"JSON for CLI" button** in the side panel — the existing JSON export
  was relabeled and its `aria-label` / tooltip updated to point at the new
  `recospec add` workflow. Internals unchanged; still calls
  `downloadJsonExport`.
- **Session versioning & diff explorer** — recordings of the same flow now
  cluster as a version tree instead of standalone rows. After the first
  three steps of a new recording are captured, the background computes a
  deterministic `flowSignature` (normalized `startUrl` + first 3 step types
  - first 2 locator strategies + selector hash) and probes the DB for prior
    sessions that share it. If a match is found, the side panel surfaces a
    banner — _"Looks like an iteration of <Login Flow>"_ — with one-click
    `Link as v2` and dismiss controls. Accepting attaches the live session
    to the matched parent: bumps `iterationNumber`, inherits the parent's
    signature, and re-derives the name as `<family> v<n>`.
- New `src/storage/session-repo.ts` helpers: `computeFlowSignature`,
  `findRootSessionId`, `getVersions` (DFS over the parent chain with depth
  annotations), `createIteration`, `findIterationCandidate`, `linkIteration`,
  `getSessionWithActions`. `updateSession` now also accepts
  `flowSignature` / `iterationNumber` / `parentSessionId` patches.
- New pure module `src/codegen/diff/session-differ.ts` with `diffSessions`
  and `summarizeDiff`. Three-pass matcher: actionId equality →
  tight LCS (`type::strategy::selector[:30]`) → loose LCS (type only) so
  locator rewrites surface as `changed` instead of phantom `added`+`removed`.
  LCS tie-breaks deterministically to the leftmost match.
- `SessionList` reorganizes into a version tree: roots render flat, children
  indent 16px per level with a chevron toggle and `v<n>` pill. A new
  **Compare** dropdown lists every sibling in the same tree and opens the
  diff modal.
- New `SessionDiffModal` (`src/side-panel/components/SessionDiffModal.tsx`)
  — side-by-side two-column view, header summary
  (`+added −removed ~changed · unchanged`), per-row tone (green added /
  red removed / amber changed) on locator and value changes, and an
  **Export diff as JSON** action that downloads the full `SessionDiff`
  plus a small summary.
- Dexie schema bumped to **v2**: `sessions` gains `iterationNumber`,
  `parentSessionId`, `flowSignature` columns and a compound
  `[parentSessionId+flowSignature]` index. An `upgrade()` callback backfills
  every pre-v2 row with `iterationNumber=1` and
  `flowSignature='legacy::<startUrl>'` so existing recordings keep working.
- New message contract: `SESSION_ITERATION_SUGGESTED` (BG → UI),
  `SESSION_ITERATION_ACCEPT` / `SESSION_ITERATION_DISMISS` (UI → BG).
  Background controller in `src/background/iteration-controller.ts`.
- New constant `ITERATION_SIGNATURE_STEPS = 3` in `shared/constants.ts` —
  the step count after which the background probes for a parent.

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
  - **Playwright TS** — `process.env.RECOSPEC_PASSWORD ?? "change-me"`
  - **Cypress JS** — `Cypress.env("password") || "change-me"`
  - **Selenium Python** — `os.environ.get('RECOSPEC_PASSWORD', 'change-me')`
  - **Selenium Java (TestNG)** — `System.getenv().getOrDefault("RECOSPEC_PASSWORD", "change-me")`
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
  `recospec:network` CustomEvent → background `EVENT_CAPTURED`. Response bodies capped
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
