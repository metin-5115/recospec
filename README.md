# Recospec

[![Release](https://img.shields.io/badge/release-v0.8.2-6366f1)](https://github.com/metin-5115/recospec/releases/tag/v0.8.2)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-1898%20passing-brightgreen)](#performance)
[![VS Code](https://img.shields.io/badge/VS_Code-extension-007ACC)](#vs-code-extension-v082)

Recospec is an open-source Chrome extension that records your browser interactions and generates production-ready test automation code with smart locator strategies and automatic Page Object Model output — no manual editing required.

## Features

- **9-strategy locator engine** — `data-testid`, test attributes (`data-test`/`data-qa`/…), `aria-label`, role+name, label, text, id, css, xpath fallback chain — plus composed (anchor+target) and parameterized-template locators for repeated rows and dynamic values.
- **Page Object Model output** — one class per page, inferred methods (e.g. `login(email, password)`).
- **Self-healing locators** — every element ships with ranked fallbacks (inline comment). Playwright page objects and Cypress commands use them at run time through a generated `selfHealingLocator` / `cy.selfHealing` helper (it logs a warning when a fallback takes over; switch it off with _Runtime self-healing_). Selenium (Python, Java) has no runtime helper, so its fallbacks are _fallback suggestions_ in comments.
- **Method inference v2** — 10 patterns (search, login, register, submitForm, fillForm, navigateFromMenu, …) with parameter-type inference; rename inline in the side panel before export.
- **Network capture & mocks** — recorder transparently captures `fetch` and `XMLHttpRequest`; opt-in mock emission produces Playwright `page.route(...)` blocks.
- **Visual regression** — capture page snapshots during recording; generated tests use Playwright's built-in `toHaveScreenshot()` or Cypress with `cypress-image-snapshot`. Baselines land under `tests/<flow-slug>.spec.ts-snapshots/` (Playwright) or `cypress/screenshots/` (Cypress) — commit them on first run.
- **Multi-framework export** — Playwright (TypeScript), Cypress (JavaScript), Selenium Python (pytest), and Selenium Java (TestNG). One recording, four outputs.
- **Assertions UI** — point-and-click visibility / text / value / attribute / count / screenshot assertions.
- **Privacy-first** — no telemetry, all session data stored locally in IndexedDB.

## Tech Stack

React 18 · TypeScript · Vite · Tailwind CSS · Zustand · Dexie (IndexedDB) · Chrome Manifest V3

## Install from Source

```bash
git clone https://github.com/metin-5115/recospec.git
cd recospec
pnpm install
pnpm build
```

Then load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder

## Supported Frameworks

| Framework                | Status    |
| ------------------------ | --------- |
| Playwright (TypeScript)  | ✅ Stable |
| Cypress (JavaScript)     | ✅ Stable |
| Selenium Python (pytest) | ✅ Stable |
| Selenium Java (TestNG)   | ✅ Stable |

## Add to an existing project (CLI)

The `recospec` CLI applies a recorded session onto an already-configured test
project — no scaffolding required, so it slots into repos that already have
their own `package.json` / `pom.xml` / runner config.

```bash
# 1. Record + export from the extension (side panel → "JSON for CLI").
# 2. Run the CLI inside your existing test project:
npx recospec add ~/Downloads/login_v1.json

# Auto-detects the framework from package.json / pom.xml / requirements.txt.
# Override it explicitly when needed:
npx recospec add login_v1.json --framework selenium-py

# Pin the framework once so subsequent runs skip detection:
npx recospec init --framework playwright-ts
```

When a target file already exists, the CLI prompts:

- `[m] merge` — append new methods/fields/scenarios via AST-aware mergers
  (Babel for TS, `python -c "import ast"` for Python with a regex fallback,
  a balanced-brace tracker for Java, `@cucumber/gherkin` for `.feature`
  files). Existing method bodies are never overwritten.
- `[o] overwrite` — replace the file outright.
- `[s] skip` — leave the file untouched.
- `[r] rename` — write next to the existing file with a `.new` suffix.
- `[d] diff` — print a unified diff, then re-prompt.

BDD output (`--bdd`) reuses the same Gherkin renderers as the extension's ZIP
export, so `.feature` + step-definition files land in the framework-idiomatic
locations (`features/` for Playwright TS, `cypress/e2e/` for Cypress,
`features/` for Selenium Py, `src/test/resources/features/` for Selenium
Java).

### File names, base URL and folders

- **One file per flow.** Specs are named after the recorded flow, so a second
  flow never overwrites the first: `<flow-slug>.spec.ts` (Playwright),
  `<flow-slug>.cy.js` (Cypress), `test_<flow_slug>.py` (Selenium Py),
  `<FlowSlug>Test.java` (Selenium Java). Feature and step files follow the same
  slug, and Playwright's visual baselines live in
  `tests/<flow-slug>.spec.ts-snapshots/`.
- **One base URL.** Generated config defaults to the origin the flow was
  recorded on and every framework lets `BASE_URL` override it
  (`BASE_URL=https://staging.example.com npx playwright test`). Specs and page
  objects use routes relative to it.
- **Your folders.** `.recospecrc.json` can relocate where `add` writes files;
  folders you leave out keep the framework's standard layout, and the
  generated imports (relative paths, Python modules, Java packages) follow:

  ```json
  {
    "version": 1,
    "framework": "playwright-ts",
    "paths": { "pagesDir": "e2e/pages", "testsDir": "e2e/specs", "featuresDir": "e2e/bdd" }
  }
  ```

  Folders must be inside the project. For Selenium Java they must sit under
  `src/main/java` (pages) and `src/test/java` (tests), because the folder is
  the package.

## Local LLM context (low-token export)

`recospec prompt` targets large models. For a small local model (Ollama,
llama.cpp, LM Studio) `recospec context` renders the same recording in far
fewer tokens: every element is listed once and the steps refer to it by id,
with no XML tags, indentation or repeated names. On the bundled fixtures the
compact output is 24–43% of the XML prompt's size.

```bash
# Pipe straight into a local model (status lines go to stderr):
npx recospec context login_v1.json --dry-run | ollama run qwen2.5-coder

# Write .recospec/context/<flow>.llm.txt (or .llm.json with --format json):
npx recospec context login_v1.json --task both
```

- `--task codegen` — page objects + steps + methods, to write test code.
- `--task heal` — adds up to 2 fallback locators and a fingerprint (`@fp`:
  DOM path, neighbouring text, position, stable attributes) per element, to
  repair a broken locator. Recordings made before fingerprints existed
  simply have no `@fp` section.
- `--task both` (default) — everything.
- `--format compact|json` — line-oriented text, or single-line JSON with short
  keys. `--no-instructions` emits only the data so you can supply your own
  system prompt.

The output is filtered for noise a small model cannot use:

- `@net` lists only same-origin calls with a status (repeats folded as `×3`,
  matrix parameters dropped) and appears only when the flow has an assertion
  that could need a mock. Trackers and beacons never show up.
- Fallbacks built on generated CSS-module classes, transient state classes
  (`--hover`) or longer than 120 characters are dropped; a primary locator
  that relies on one is flagged with `!`.
- `@fp` omits masked (`«dynamic»`) values, UI-state attributes such as
  `aria-expanded`, ancestor paths that only contain `div`/`span`, and attributes
  whose value the element's label or locators already state.

Secret values never appear: filled credentials become `$RECOSPEC_*`
references and the same leak guard as `recospec prompt` runs on the output.
The side panel has a matching **Local LLM context** card with a token
estimate.

## VS Code extension (v0.8.2)

Recospec ships a companion VS Code extension that brings the **record →
apply → Claude prompt** workflow directly into the editor. No terminal
hop required.

- **`Recospec: Record Flow…`** — launches Chromium with the Recospec
  Chrome extension pre-bundled, captures the flow, and round-trips the
  JSON back into VS Code automatically.
- **Output Picker webview** — checkbox UI for what to emit on each apply
  (test code, Claude prompt, BDD output, network mocks, redaction).
- **Recordings tree view** — activity-bar sidebar lists every recording
  in `.recospec/sessions/` for one-click re-apply.
- **Same merge engine as the CLI** — page-object conflicts surface as a
  QuickPick (Merge / Overwrite / Skip / `.new` / Diff).
- **Claude Code integration** — every apply optionally emits a
  `/recospec-<flow>` slash command with locator catalogue + sensitive-
  value contract.

Install: download the VSIX from the
[latest GitHub release](https://github.com/metin-5115/recospec/releases/latest)
→ Extensions → "Install from VSIX…". Requires a Playwright runtime in the
target project (`@playwright/test`).

Build from source:

```bash
pnpm install
pnpm build          # Chrome ext dist
pnpm build:vscode   # VS Code ext dist (mirrors chrome-ext/ next door)
pnpm package:vscode # → releases/recospec-0.8.2.vsix
```

## Performance

Latency is measured by `benchmarks/performance.test.ts` (jsdom, `pnpm bench`, run on every CI
pass). Sizes are measured by `pnpm size` (`scripts/check-bundle-size.mjs`), which CI runs after
the three builds and fails when a budget is exceeded. KB = 1000 bytes.

| Metric                                                | Result       | Budget             |
| ----------------------------------------------------- | ------------ | ------------------ |
| Single locator evaluate (p99, simple form)            | **~2 ms**    | < 5 ms             |
| Single locator evaluate (max, 1000-elem DOM)          | **~45 ms**   | < 500 ms           |
| Chrome extension JS, all chunks (gzip)                | **~264 KB**  | < 500 KB           |
| Chrome extension JS, all chunks (raw)                 | **~881 KB**  | < 900 KB (ceiling) |
| Side panel JS loaded on open (raw)                    | **~555 KB**  | —                  |
| CLI bundle (`pnpm build:cli`, minified)               | **~232 KB**  | < 250 KB           |
| VS Code activation bundle (`extension.cjs`, minified) | **~283 KB**  | < 400 KB           |
| VS Code merge engines (loaded on first merge)         | **~987 KB**  | —                  |
| Unit tests (`pnpm test`, 16 cores)                    | **~25–35 s** | — (target < 10 s)  |
| Tests passing                                         | **1898**     | —                  |

The side panel loads the ZIP writer (JSZip) and the codegen adapters only when you export, and
the VS Code extension activates on its view, its commands, or a `.recospecrc.json` workspace
instead of on every startup. The Chrome service worker still loads its codegen code eagerly:
dynamic `import()` is not allowed in service workers.

## Screenshots

_Demo GIF and screenshots coming soon._

## License

MIT — see [LICENSE](LICENSE)

## Contributing

Issues and PRs are welcome.

### Setup

```bash
git clone https://github.com/metin-5115/recospec.git
cd recospec
pnpm install
```

### Test commands

```bash
pnpm typecheck        # TypeScript type check (src + tests)
pnpm lint             # ESLint (zero warnings policy)
pnpm test             # Unit tests (no typecheck; see pnpm check)
pnpm test:ci          # Unit tests with coverage report
pnpm check            # Typecheck + lint + unit tests in one go
pnpm bench            # Mutation-survival and latency benchmarks
pnpm test:e2e         # E2E tests (requires built extension)
```

### PR process

1. Branch from `main`, use `feat/`, `fix/`, or `chore/` prefix.
2. Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
3. Run `pnpm test:ci` locally — CI enforces 75% coverage threshold.
4. Build must be clean: `pnpm build`.
5. Open a PR against `main`; CI runs automatically.
