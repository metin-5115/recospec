# Recospec for VS Code

> Record a flow in Chromium, ship a Playwright / Cypress / Selenium test —
> without leaving the editor.

Recospec brings the **record → apply → Claude prompt** workflow of the
Recospec Chrome extension directly into VS Code. Hit a hotkey, click
through a flow in a bundled Chromium window, and the extension drops page
objects, a scenario file, and a Claude Code slash command into your project
— all wired to the same locator engine the standalone Chrome extension
ships (`9` strategies, self-healing fallbacks, Page Object inference,
network mock capture, sensitive-value redaction).

![Recospec VS Code — record demo](icons/recospec.png)

> _Screenshot / GIF coming soon — drop a recording into `assets/` and the
> README will be republished._

## Highlights

- **One-click record** — `Recospec: Record Flow…` launches Chromium with
  the Recospec Chrome extension pre-bundled. No separate install.
- **Output Picker webview** — checkbox UI for what to emit on each apply:
  test code, Claude prompt (slash / `CLAUDE.md` block / standalone),
  Gherkin BDD output, network mocks, redaction.
- **Auto-merge** — when a page object already exists, the extension drops
  the new methods into the existing class via the same Babel / Python AST /
  Java tokenizer / Gherkin mergers the CLI uses. Conflicts surface as a
  QuickPick (Merge / Overwrite / Skip / `.new` / Diff).
- **Recordings tree view** — Activity bar sidebar lists every recording in
  `.recospec/sessions/` for the active workspace; click to re-apply,
  right-click to delete or reveal on disk.
- **Claude Code prompt** — every apply optionally emits a
  `.claude/commands/recospec-<flow>.md` slash command with a locator
  catalogue, fragility hints, and a sensitive-value contract. Sensitive
  fill values are replaced with `<REDACTED:RECOSPEC_*>` placeholders —
  literals never leave the recording.

## Supported frameworks

| Framework                | Status    |
| ------------------------ | --------- |
| Playwright (TypeScript)  | ✅ Stable |
| Cypress (JavaScript)     | ✅ Stable |
| Selenium Python (Pytest) | ✅ Stable |
| Selenium Java (TestNG)   | ✅ Stable |

Framework is auto-detected from `package.json` / `pom.xml` /
`requirements.txt`. Pin one explicitly with `Recospec: Init Project` so
subsequent applies skip detection.

## Install

### From VSIX (recommended for v0.7)

1. Download `recospec-0.7.0.vsix` from the
   [releases page](https://github.com/metin-5115/recospec/releases).
2. In VS Code: **Extensions** view → `…` menu → **Install from VSIX…** →
   pick the file.
3. Reload VS Code (`Developer: Reload Window` from the command palette).
4. The Recospec icon shows up in the activity bar; the `Recospec: …`
   commands are in the command palette.

### From source (development)

```bash
git clone https://github.com/metin-5115/recospec.git
cd recospec
pnpm install
pnpm build           # Chrome extension dist
pnpm build:vscode    # VS Code extension dist (also mirrors chrome-ext/)
code --extensionDevelopmentPath="$PWD/vscode-extension"
```

The dev launch opens a new VS Code window with Recospec active; iterate
on the extension by re-running `pnpm build:vscode` and `Developer: Reload
Window`.

### Playwright (required runtime dep)

The Record command launches Chromium via Playwright. If it is not already
in the workspace's `node_modules`, install it once globally:

```bash
pnpm add -g @playwright/test
npx playwright install chromium
```

The bundled Chromium download is a one-time ~150 MB cost. The extension
will surface a clear error if Playwright is missing or the browser binary
hasn't been installed.

## Commands

| Command                           | What it does                                                                                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Recospec: Record Flow…`          | Launches Chromium with the Recospec Chrome extension pre-loaded. Use the side panel **Start → Stop**, then click **Stop & Apply** in VS Code. The Output Picker opens automatically once the JSON is extracted. |
| `Recospec: Apply Existing JSON…`  | Picks a Recospec JSON file from disk, opens the Output Picker, and applies the selected outputs to the active workspace. Same merge / conflict UX as the Record flow.                                           |
| `Recospec: Render Claude Prompt…` | Renders a Claude Code prompt from a JSON export and previews it in a new editor tab. Does not write to disk.                                                                                                    |
| `Recospec: Init Project…`         | Writes `.recospecrc.json` so future applies skip framework detection.                                                                                                                                           |

## Recordings tree view

Every recording is persisted to `.recospec/sessions/` in the active
workspace. The **Recospec** activity-bar view lists them newest-first;
each item is one-click re-apply with the Output Picker, and right-click
exposes **Delete** and **Reveal in File Explorer**.

Add `.recospec/` to `.gitignore` if you do not want the JSON history
committed.

## Output Picker

When you apply (either via Record or Apply Existing JSON…), a webview
opens with the per-run choices:

- **Test code** — render page objects + scenario via the matching
  adapter. Toggle off if you only want a Claude prompt.
- **BDD output** — emit a Gherkin `.feature` + step definitions instead
  of a vanilla spec.
- **Network mocks** — forward captured `fetch`/`XMLHttpRequest` calls as
  Playwright `page.route(...)` fulfillments (Playwright adapter only;
  greyed out otherwise).
- **Claude prompt** — emit a slash command (`/recospec-<slug>`) or a
  block inside `CLAUDE.md` or a plain prompt under `prompts/`.
- **Redact sensitive values** — replace passwords / tokens / secrets with
  `<REDACTED:RECOSPEC_*>` placeholders.

Closing the picker (`Esc`, click outside, Cancel) cancels the apply with
no files written.

## Privacy

Recospec is privacy-first by design: no telemetry, no analytics, no
network egress. The VS Code extension reads JSON from disk and writes
files to your workspace; everything stays local. Sensitive fill values
are redacted to `<REDACTED:RECOSPEC_*>` placeholders before rendering
Claude prompts unless you explicitly opt out.

## Troubleshooting

**“Bundled Chrome extension missing.”**
The VSIX was packaged without the Chrome extension copy. Re-run
`pnpm build && pnpm build:vscode` and reinstall.

**“No steps recorded.”**
You closed the side-panel session before any step was captured. Start a
new session and interact with the page before stopping.

**Chromium closed before Stop.**
The export bridge requires the Chrome extension's service worker to be
alive. Close VS Code's notification only **after** you click Stop in the
side panel. Closing Chromium first drops the in-flight recording.

**“Could not auto-detect a framework.”**
Run `Recospec: Init Project` once and choose the framework, or hand-edit
`.recospecrc.json`.

## Source

[github.com/metin-5115/recospec](https://github.com/metin-5115/recospec) ·
MIT licensed.
