# recospec

Command-line companion to the [Recospec](https://github.com/metin-5115/recospec) Chrome extension.
Record a flow in the browser, export it as JSON, then drop it into an existing test project —
or turn it into a prompt for Claude Code.

```bash
npx recospec --help
```

Requires Node.js 20 or newer. Nothing is sent over the network.

## Commands

### `recospec add <json> [projectDir]`

Renders page objects and a scenario from a recording and writes them into your project.
Existing files are merged where possible (TypeScript, Python, Java page objects and `.feature` files);
other conflicts ask before overwriting.

```bash
recospec add login.json            # framework is auto-detected
recospec add login.json --bdd      # Gherkin .feature + step definitions
recospec add login.json --dry-run  # show what would change
```

Frameworks: `playwright-ts`, `cypress`, `selenium-py`, `selenium-java`. Override detection with `-f <id>`.

### `recospec init [projectDir]`

Writes a `.recospecrc.json` so later `add` calls skip framework detection (`--framework`, `--bdd`).

### `recospec prompt <json> [projectDir]`

Renders an XML-tagged coding prompt (recorded locators, ordered flow, secrets contract, task and
rules) that you can hand to Claude Code.

```bash
recospec prompt login.json --mode prompt        # prompts/<slug>.md
recospec prompt login.json --mode slash         # .claude/commands/recospec-<slug>.md
recospec prompt login.json --mode claude-md     # managed block inside CLAUDE.md
recospec prompt login.json --dry-run            # print to stdout
```

Sensitive values (passwords, tokens, emails) are replaced with `[REDACTED:RECOSPEC_*]` placeholders
and mapped to environment variables. `--no-redact` embeds them literally; treat that output as confidential.

## Getting a recording

Use the Recospec Chrome extension (side panel → **JSON for CLI**) or the Recospec VS Code extension.

## License

MIT
