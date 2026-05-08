# PlayForge

PlayForge is an open-source Chrome extension that records your browser interactions and generates production-ready test automation code with smart locator strategies and automatic Page Object Model output — no manual editing required.

## Features

- **9-strategy locator engine** — `data-testid`, `aria-label`, role+name, label, text, id, css, xpath fallback chain.
- **Page Object Model output** — one class per page, inferred methods (e.g. `login(email, password)`).
- **Self-healing locators** — every element ships with ranked fallbacks (inline comment) and the generated project includes a `selfHealingLocator` / `cy.selfHealing` helper that walks the chain at runtime.
- **Multi-framework export** — Playwright (TypeScript) and Cypress (JavaScript), more on the way.
- **Assertions UI** — point-and-click visibility / text / value / attribute / count assertions.
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
| Playwright (TypeScript)  | ✅          |
| Cypress (JavaScript)     | Coming soon |
| Selenium Python (pytest) | Coming soon |
| Selenium Java (TestNG)   | Coming soon |

## Screenshot

_Screenshot / GIF coming at v0.1.0 launch._

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
