# PlayForge

[![Release](https://img.shields.io/badge/release-v0.5.0-6366f1)](https://github.com/metin-5115/playforge/releases/tag/v0.5.0)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-248%20passing-brightgreen)](#performance)

PlayForge is an open-source Chrome extension that records your browser interactions and generates production-ready test automation code with smart locator strategies and automatic Page Object Model output — no manual editing required.

## Features

- **9-strategy locator engine** — `data-testid`, `aria-label`, role+name, label, text, id, css, xpath fallback chain.
- **Page Object Model output** — one class per page, inferred methods (e.g. `login(email, password)`).
- **Self-healing locators** — every element ships with ranked fallbacks (inline comment) and the generated project includes a `selfHealingLocator` / `cy.selfHealing` helper that walks the chain at runtime.
- **Method inference v2** — 10 patterns (search, login, register, submitForm, fillForm, navigateFromMenu, …) with parameter-type inference; rename inline in the side panel before export.
- **Network capture & mocks** — recorder transparently captures `fetch` and `XMLHttpRequest`; opt-in mock emission produces Playwright `page.route(...)` blocks.
- **Visual regression** — capture page snapshots during recording; generated tests use Playwright's built-in `toHaveScreenshot()` or Cypress with `cypress-image-snapshot`. Baselines land under `tests/scenario.spec.ts-snapshots/` (Playwright) or `cypress/screenshots/` (Cypress) — commit them on first run.
- **Multi-framework export** — Playwright (TypeScript) and Cypress (JavaScript). Same recording, two outputs.
- **Assertions UI** — point-and-click visibility / text / value / attribute / count / screenshot assertions.
- **Privacy-first** — no telemetry, all session data stored locally in IndexedDB.

## Tech Stack

React 18 · TypeScript · Vite · Tailwind CSS · Zustand · Dexie (IndexedDB) · Chrome Manifest V3

## Install from Source

```bash
git clone https://github.com/your-username/playforge.git
cd playforge
pnpm install
pnpm build
```

Then load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder

## Supported Frameworks

| Framework                | Status      |
| ------------------------ | ----------- |
| Playwright (TypeScript)  | ✅ Stable   |
| Cypress (JavaScript)     | ✅ Stable   |
| Selenium Python (pytest) | Coming soon |
| Selenium Java (TestNG)   | Coming soon |

## Performance

Measured via `benchmarks/performance.test.ts` (jsdom, run on every CI pass):

| Metric                                       | Result        | Budget   |
| -------------------------------------------- | ------------- | -------- |
| Single locator evaluate (p99, simple form)   | **1.33 ms**   | < 5 ms   |
| Single locator evaluate (max, 1000-elem DOM) | **130 ms**    | < 500 ms |
| Total dist bundle (uncompressed)             | **~478 KB**   | < 500 KB |
| Unit tests passing                           | **248 / 248** | —        |

## Screenshot

_Screenshot / GIF coming soon._

## License

MIT — see [LICENSE](LICENSE)

## Contributing

Issues and PRs are welcome.

### Setup

```bash
git clone https://github.com/your-username/playforge.git
cd playforge
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
