# Recospec

[![Release](https://img.shields.io/badge/release-v0.7.0-6366f1)](https://github.com/metin-5115/recospec/releases/tag/v0.7.0)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-950%20passing-brightgreen)](#performance)
[![VS Code](https://img.shields.io/badge/VS_Code-extension-007ACC)](#vs-code-extension-v070)

Recospec is an open-source Chrome extension that records your browser interactions and generates production-ready test automation code with smart locator strategies and automatic Page Object Model output — no manual editing required.

## Features

- **9-strategy locator engine** — `data-testid`, test attributes (`data-test`/`data-qa`/…), `aria-label`, role+name, label, text, id, css, xpath fallback chain — plus composed (anchor+target) and parameterized-template locators for repeated rows and dynamic values.
- **Page Object Model output** — one class per page, inferred methods (e.g. `login(email, password)`).
- **Self-healing locators** — every element ships with ranked fallbacks (inline comment) and the generated project includes a `selfHealingLocator` / `cy.selfHealing` helper that walks the chain at runtime.
- **Method inference v2** — 10 patterns (search, login, register, submitForm, fillForm, navigateFromMenu, …) with parameter-type inference; rename inline in the side panel before export.
- **Network capture & mocks** — recorder transparently captures `fetch` and `XMLHttpRequest`; opt-in mock emission produces Playwright `page.route(...)` blocks.
- **Visual regression** — capture page snapshots during recording; generated tests use Playwright's built-in `toHaveScreenshot()` or Cypress with `cypress-image-snapshot`. Baselines land under `tests/scenario.spec.ts-snapshots/` (Playwright) or `cypress/screenshots/` (Cypress) — commit them on first run.
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

## VS Code extension (v0.7.0)

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
pnpm package:vscode # → releases/recospec-0.7.0.vsix
```

## Performance

Measured via `benchmarks/performance.test.ts` (jsdom, run on every CI pass):

| Metric                                       | Result      | Budget   |
| -------------------------------------------- | ----------- | -------- |
| Single locator evaluate (p99, simple form)   | **~3.2 ms** | < 5 ms   |
| Single locator evaluate (max, 1000-elem DOM) | **~340 ms** | < 500 ms |
| CLI bundle (`pnpm build:cli`, uncompressed)  | **~203 KB** | < 250 KB |
| Chrome dist JS (uncompressed)                | **~970 KB** | —        |
| VS Code bundle (`pnpm build:vscode`)         | **~2.1 MB** | — (CJS)  |
| Unit tests passing                           | **950**     | —        |

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
pnpm test             # Unit tests (runs typecheck first)
pnpm test:ci          # Unit tests with coverage report
pnpm test:e2e         # E2E tests (requires built extension)
```

### PR process

1. Branch from `main`, use `feat/`, `fix/`, or `chore/` prefix.
2. Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
3. Run `pnpm test:ci` locally — CI enforces 75% coverage threshold.
4. Build must be clean: `pnpm build`.
5. Open a PR against `main`; CI runs automatically.
