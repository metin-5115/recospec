# Contributing to Recospec

Thanks for your interest in Recospec! This is an open-source (MIT) Chrome
extension that records browser interactions and generates production-ready test
automation code. Contributions of all sizes are welcome — bug reports, docs,
locator-engine fixtures, and new framework adapters.

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

Requirements: **Node 20+** (see `.nvmrc`) and **pnpm** (recommended).

```bash
git clone https://github.com/metin-5115/recospec.git
cd recospec
pnpm install
pnpm build        # builds the Chrome extension into dist/
pnpm test         # runs the Vitest unit suite
```

Load the unpacked extension from `dist/` via `chrome://extensions` (Developer
mode → Load unpacked) to try your change live.

Useful scripts:

| Command             | What it does                     |
| ------------------- | -------------------------------- |
| `pnpm test`         | Vitest unit suite (target: <10s) |
| `pnpm test --watch` | Watch mode while developing      |
| `pnpm build`        | Chrome extension build           |
| `pnpm build:e2e`    | Extension build for E2E tests    |
| `pnpm build:cli`    | CLI bundle (`dist/cli/index.js`) |
| `pnpm build:vscode` | VS Code extension bundle         |
| `pnpm lint`         | ESLint + Prettier check          |

## Project layout (where things go)

- **Pure logic** (no DOM, no browser API) → `src/locator-engine/`, `src/codegen/`
- **Browser API** → `src/background/`, `src/content/`, `src/storage/`
- **React UI** → `src/popup/`, `src/side-panel/`
- **Shared types / messaging / constants** → `src/shared/`

See `CLAUDE.md` for the full architecture and naming conventions.

## House rules (please read)

These keep the codebase consistent — PRs that follow them merge faster:

- **No `any`** — use `unknown` + a type guard.
- **No `console.log`** — use `src/shared/logger.ts`.
- **No magic numbers/strings** — add them to `src/shared/constants.ts`.
- **No `localStorage`/`sessionStorage`** — persistence goes through IndexedDB (Dexie). One exception: `chrome.storage.session` holds a single boolean mirror of "a recording is active" (`src/shared/recording-flag.ts`) so a content script can skip waking the service worker; IndexedDB stays the source of truth.
- **No floating promises** — every async call is `await`ed or `.catch()`ed.
- **Tagged template literals** for codegen — no Handlebars/EJS.
- Use **path aliases** (`@locator/…`, `@codegen/…`, `@shared/…`), not deep relative imports.
- Keep diffs focused and reasonably small; avoid drive-by refactors.

## Testing expectations

- New features should ship with tests. **TDD is encouraged.**
- Coverage targets: **75%+ overall**, **85%+** for `locator-engine` and `codegen`.
- **Locator strategies:** each strategy has its own test file with at least
  1 positive, 1 negative, and 2 edge cases. Use jsdom + offline fixtures under
  `benchmarks/fixtures/` — never real site URLs.
- **Codegen adapters:** snapshot-test the IR → output, and make sure the generated
  code is actually parseable/compilable (smoke validation).

Run `pnpm test` and `pnpm build` before opening a PR; CI must be green.

## Commit & PR conventions

We use **Conventional Commits** (enforced by a Husky pre-commit hook):

```
type(scope): subject
```

- **Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`
- **Scopes:** `locator`, `codegen`, `ui`, `storage`, `bg`, `content`, `build`, `deps`

Examples:

```
feat(locator): add aria-describedby strategy
fix(codegen): handle empty page title gracefully
test(locator): add fixture for Material-UI v5
```

For pull requests:

1. Branch off `main`.
2. Keep the PR scoped to one logical change.
3. Fill in the PR template (what/why/how-tested).
4. Make sure `pnpm test` and `pnpm lint` pass.

## Adding a new framework adapter

Recospec's codegen is a shared IR → adapter pipeline, so a new framework is
mostly one self-contained adapter:

1. Create `src/codegen/adapters/<your-framework>/` with `locator.ts`,
   `page-object.ts`, `scenario.ts`, and `scaffold.ts`.
2. Register it in the `ADAPTER_REGISTRY` and add the `FrameworkId`.
3. Wire it into the `FrameworkPicker` and the side panel.
4. Add snapshot tests + an output-validation test (parse/compile the result).

Look at `src/codegen/adapters/selenium-py/` or `selenium-java/` as references.
If you're proposing a new framework, please open an **Adapter request** issue
first so we can align on the idioms.

## Reporting bugs & requesting features

Use the issue templates:

- **Bug report** — what happened, repro steps, the site/framework, expected vs actual.
- **Feature request** — the problem you're trying to solve.
- **Adapter request** — the framework + runner + a small example of ideal output.

Please include a **minimal, offline reproduction** where possible (an HTML
snippet beats a link to a live site).

## License

By contributing, you agree that your contributions will be licensed under the
project's [MIT License](LICENSE).
