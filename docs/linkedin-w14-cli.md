# PlayForge v0.6.0 — `playforge add` ships

After 13 weeks of building a Chrome extension that records flows and emits
production-grade test code, I kept hitting the same wall: the extension
exports a self-contained ZIP scaffold, but most teams already have a
configured test project. They don't want a new repo — they want the new
flow merged into the one they already maintain.

So v0.6.0 ships a CLI.

```bash
# 1. Record + click "JSON for CLI" in the side panel.
# 2. In your existing test project:
npx playforge add login_v1.json
```

That's it. The CLI auto-detects the framework from `package.json`, `pom.xml`,
or `requirements.txt`, renders the page objects + spec through the same
adapter the extension uses, and writes them under the conventions your repo
already follows (`pages/` for Playwright, `cypress/e2e/` for Cypress,
`src/main/java/pages/` for Selenium Java, …). No package.json, no
playwright.config.ts — the CLI explicitly **skips the scaffold**.

## The interesting bit: AST-aware merging

When a file already exists, you get five choices:

```
> [m] merge — append new methods/getters into the existing class
  [o] overwrite
  [s] skip
  [r] rename — write *.new.<ext>
  [d] diff — show a unified diff, re-prompt
```

`merge` is the headline. Each language gets its own merger:

- **TypeScript** — `@babel/parser` + `traverse` + `generator`. Walks the
  exported class, appends members the existing class lacks, dedupes
  imports. Existing method bodies are never overwritten.
- **Python** — `spawnSync(python, '-c', 'import ast; …')` extracts the
  canonical class-member name list. No Python on PATH? Fall back to a
  regex extractor; the user is still in the loop because they explicitly
  chose `m`.
- **Java** — javaparser is JVM-only and the npm port is unmaintained, so I
  wrote a tokenising balanced-brace walker. It handles strings, char
  literals, and comments correctly. Nested classes (which would confuse
  brace counting) trigger an explicit `overwrite ↔ skip` prompt instead of
  rolling the dice.
- **`.feature` files** — `@cucumber/gherkin` parses the existing feature,
  collects scenario titles, and the CLI appends incoming scenarios by
  title (case-insensitive). The `Feature:` header is preserved — duplicates
  are impossible by construction.

## Bonus: `--bdd` and `playforge init`

The BDD output the extension shipped in P6 is reused as-is. Same Gherkin
renderers, same step definitions — `playforge add login.json --bdd` drops a
`.feature` + step file into the framework's idiomatic folder.

`playforge init` writes a `.playforgerc.json` so subsequent `add` calls skip
detection. The rc currently pins `framework` and `bdd`; in P7.3 it'll also
override path conventions for repos that don't follow defaults.

## The numbers

- 629 / 629 tests passing (22 new for the CLI mergers + detection + rc loader)
- CLI bundle: 164 KB uncompressed (single ESM file, Babel + commander + prompts inlined)
- Same shipping schedule as everything else: every prompt-sized chunk is a
  conventional commit, milestones get a tag, no surprises in `git log`.

Repo: https://github.com/metin-5115/playforge

Next up (P7.3): rc-driven path overrides + Cypress JS merger.

#testautomation #chromeextension #typescript #selenium #playwright #cypress
