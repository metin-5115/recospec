# LinkedIn — PlayForge v0.7.0 launch post

> Working draft. Tweak the hook and the “closing question” before posting.

---

🎬 **PlayForge v0.7.0 — record in VS Code, ship a test in 30 seconds.**

For the past two months I've been chasing one workflow:

> _Hit a hotkey. Click through a flow in a browser. Watch a working
> Playwright test land in your editor._

Today that workflow is real. PlayForge now ships a companion **VS Code
extension** that wraps the existing Chrome-extension recorder, the
4-framework codegen pipeline, and a fresh **Claude Code prompt exporter**
into a single round-trip.

---

**What changed in v0.7.0**

🟣 `PlayForge: Record Flow…` — one command. Chromium launches with the
PlayForge extension already bundled. You record. You stop. The recording
flies back into VS Code via a Playwright service-worker eval, the
Output Picker webview opens, you tick a few boxes, and your repo grows
three files:

```
pages/LoginPage.ts
tests/scenario.spec.ts
.claude/commands/playforge-login.md
```

The page object has the **9-strategy locator engine's** picks (no
hand-tuned selectors), self-healing fallbacks inline, and any password
field has already been rewritten to
`process.env.PLAYFORGE_PASSWORD ?? 'change-me'`.

🟣 **Claude Code integration** — every apply optionally drops a
`/playforge-<flow>` slash command containing the locator catalogue as
fenced JSON, fragility hints, and a sensitive-value contract. When the
UI shifts later, Claude has the ground truth right there: no
hallucinated selectors.

🟣 **Recordings tree view** — every recording is persisted to
`.playforge/sessions/` in the workspace. Click to re-apply, right-click
to delete or open in finder. The tree updates live via a workspace file
watcher.

🟣 **Output Picker webview** — strict CSP, per-load nonce, no remote
resources. Picks: test code, BDD, network mocks (auto-greyed when no
network steps were captured), Claude prompt (three flavours), redact
sensitive values. The picker clamps every choice server-side so a
tampered webview cannot smuggle a forbidden combo.

🟣 **`EXPORT_REQUEST` bridge** — the VS Code host pulls the JSON from
the Chrome extension's MV3 service worker via Playwright
`worker.evaluate(...)`. `chrome.runtime.sendMessage` cannot deliver to
the sender; CDP eval is the only working bridge. `context.on('close')`
races the wait so an early browser close never hangs the command.

---

**By the numbers**

- **661 / 661 tests passing**.
- VS Code extension bundle: **~2.16 MB CJS**.
- 4 framework adapters (Playwright TS, Cypress JS, Selenium Python,
  Selenium Java) — same recording, four outputs.
- Zero telemetry, zero analytics, zero network egress.

---

**Install (VSIX, marketplace publish on the horizon)**

1. Download `playforge-0.7.0.vsix` from the GitHub release.
2. Extensions → "Install from VSIX…".
3. Hit `Cmd/Ctrl + Shift + P` → `PlayForge: Record Flow…`.

Source + release notes:
https://github.com/metin-5115/playforge/releases/tag/v0.7.0

---

If you've shipped a Playwright codegen wrapper, a recording-driven test
generator, or a Claude Code slash-command pipeline — what's the **one
edge case** that broke first in your prototype? Always curious which
selector-bricks tend to fall.

#testing #playwright #cypress #selenium #vscode #claudecode #typescript
#opensource
