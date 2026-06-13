/**
 * Webview HTML for the Output Picker. Returns a single self-contained HTML
 * document with CSP locked down to the webview origin + a per-load nonce.
 *
 * Why inline JS + nonce instead of a separate `.js` file?
 *   - VS Code webviews already serve resources over `vscode-resource:` /
 *     `webview.cspSource`. A nonce lets us inline a tiny script without
 *     opening `'unsafe-inline'`, which would be a CSP smell.
 *   - The picker is < 5kB of logic. A second resource file would mean
 *     more `asWebviewUri` wiring and another file to keep in lockstep
 *     with the message contract.
 *
 * The script posts a single message back to the host:
 *   { type: 'submit', choices: PickerChoices }
 *   { type: 'cancel' }
 */

import type { PromptMode } from '@codegen/export/prompt-export'
import type { FrameworkId } from '@shared/types/generated'

export interface PickerChoices {
  /** Emit the page object class(es) via the adapter. */
  pageObjects: boolean
  /** Emit the scenario / test spec (or BDD feature + steps) via the adapter. */
  test: boolean
  /** Emit a Claude Code prompt alongside the test code. */
  claudePrompt: boolean
  /** Prompt output flavour — only honoured when `claudePrompt === true`. */
  promptMode: PromptMode
  /** Emit Gherkin `.feature` + step definitions instead of a vanilla spec. */
  bdd: boolean
  /** Forward captured network requests to the adapter as `page.route(...)` mocks. */
  mocks: boolean
  /** Redact sensitive values in the prompt (`<REDACTED:RECOSPEC_*>`). */
  redact: boolean
}

export interface PickerMeta {
  jsonPath: string
  sessionName: string
  framework: FrameworkId
  frameworkLabel: string
  stepCount: number
  hasNetworkSteps: boolean
  supportsBdd: boolean
}

/**
 * Cryptographically random 16-byte nonce, hex-encoded. CSP requires nonces
 * to be unguessable; `crypto.randomUUID()` (no dashes) gives us 32 hex
 * chars from a CSPRNG without pulling `node:crypto`.
 */
export function makeNonce(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '')
}

/** Locks the webview to its own origin + the per-load script nonce. */
export function buildCsp(webviewCspSource: string, nonce: string): string {
  return [
    `default-src 'none'`,
    `style-src ${webviewCspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${webviewCspSource} data:`,
    `font-src ${webviewCspSource}`,
  ].join('; ')
}

/**
 * Make a JSON payload safe to embed inside `<script>…</script>`. JSON.stringify
 * does not escape `</` or `<!--`, so a session name containing literal
 * `</script>` would otherwise close the host tag early.
 */
function safeJsonInScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/<\/(script)/gi, '<\\/$1')
    .replace(/<!--/g, '<\\!--')
}

export function renderOutputPickerHtml(
  meta: PickerMeta,
  webviewCspSource: string,
  nonce: string,
): string {
  const csp = buildCsp(webviewCspSource, nonce)
  const metaPayload = safeJsonInScript({
    sessionName: meta.sessionName,
    frameworkLabel: meta.frameworkLabel,
    stepCount: meta.stepCount,
    hasNetworkSteps: meta.hasNetworkSteps,
    supportsBdd: meta.supportsBdd,
  })

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="${csp}"
    />
    <title>Recospec — Output Picker</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 20px 24px;
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }
      h1 {
        margin: 0 0 4px;
        font-size: 1.1em;
        font-weight: 600;
      }
      .subtitle {
        margin: 0 0 18px;
        color: var(--vscode-descriptionForeground);
        font-size: 0.9em;
      }
      .meta {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 4px 14px;
        margin: 0 0 22px;
        padding: 10px 14px;
        background: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-editorWidget-border, transparent);
        border-radius: 4px;
        font-size: 0.9em;
      }
      .meta dt {
        color: var(--vscode-descriptionForeground);
        margin: 0;
      }
      .meta dd {
        margin: 0;
      }
      fieldset {
        border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border));
        border-radius: 4px;
        padding: 12px 16px;
        margin: 0 0 18px;
      }
      legend {
        padding: 0 6px;
        font-weight: 600;
        font-size: 0.92em;
      }
      label.option {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 6px 0;
        cursor: pointer;
      }
      label.option input[type='checkbox'] {
        margin: 4px 0 0;
        accent-color: var(--vscode-checkbox-selectBackground, var(--vscode-button-background));
      }
      label.option.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      label.option .label {
        font-weight: 500;
      }
      label.option .desc {
        display: block;
        color: var(--vscode-descriptionForeground);
        font-size: 0.85em;
        margin-top: 2px;
      }
      .nested {
        margin: 6px 0 0 26px;
        padding: 8px 0 4px;
        border-top: 1px dashed var(--vscode-editorWidget-border, transparent);
      }
      .nested.hidden {
        display: none;
      }
      .nested label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.9em;
        margin: 4px 0;
      }
      .nested input[type='radio'] {
        accent-color: var(--vscode-checkbox-selectBackground, var(--vscode-button-background));
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 10px;
      }
      button {
        padding: 6px 18px;
        font-family: inherit;
        font-size: inherit;
        border-radius: 2px;
        cursor: pointer;
        border: 1px solid transparent;
      }
      button.primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }
      button.primary:hover {
        background: var(--vscode-button-hoverBackground);
      }
      button.primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      button.secondary {
        background: var(--vscode-button-secondaryBackground, transparent);
        color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
        border-color: var(--vscode-button-border, var(--vscode-contrastBorder, transparent));
      }
      button.secondary:hover {
        background: var(--vscode-button-secondaryHoverBackground, transparent);
      }
      .footnote {
        margin: 14px 0 0;
        font-size: 0.8em;
        color: var(--vscode-descriptionForeground);
      }
    </style>
  </head>
  <body>
    <h1>Apply Recospec session</h1>
    <p class="subtitle" id="subtitle"></p>

    <dl class="meta" id="meta"></dl>

    <fieldset>
      <legend>What to emit</legend>
      <label class="option">
        <input type="checkbox" id="opt-page-objects" checked />
        <span>
          <span class="label">Page objects</span>
          <span class="desc">One class per page, with the inferred methods.</span>
        </span>
      </label>
      <label class="option">
        <input type="checkbox" id="opt-test" checked />
        <span>
          <span class="label">Test spec</span>
          <span class="desc">The scenario test that drives the page objects.</span>
        </span>
      </label>
      <label class="option" id="opt-bdd-wrap">
        <input type="checkbox" id="opt-bdd" />
        <span>
          <span class="label">BDD output</span>
          <span class="desc">
            Emit a Gherkin <code>.feature</code> + step definitions instead of a vanilla spec.
          </span>
        </span>
      </label>
      <label class="option" id="opt-mocks-wrap">
        <input type="checkbox" id="opt-mocks" />
        <span>
          <span class="label">Network mocks</span>
          <span class="desc">
            Forward captured requests as <code>page.route(...)</code> fulfillments.
          </span>
        </span>
      </label>
    </fieldset>

    <fieldset>
      <legend>Claude Code prompt</legend>
      <label class="option">
        <input type="checkbox" id="opt-claude-prompt" checked />
        <span>
          <span class="label">Generate prompt</span>
          <span class="desc">
            Write a Claude Code prompt so <code>/recospec-&lt;slug&gt;</code> can update the
            test later with the locator catalogue as ground truth.
          </span>
        </span>
      </label>
      <div class="nested" id="prompt-mode-wrap">
        <label>
          <input type="radio" name="prompt-mode" value="slash" checked />
          <span>Slash command — <code>.claude/commands/recospec-&lt;slug&gt;.md</code></span>
        </label>
        <label>
          <input type="radio" name="prompt-mode" value="claude-md" />
          <span>CLAUDE.md marker block</span>
        </label>
        <label>
          <input type="radio" name="prompt-mode" value="prompt" />
          <span>Plain prompt — <code>prompts/&lt;slug&gt;.md</code></span>
        </label>
      </div>
      <label class="option">
        <input type="checkbox" id="opt-redact" checked />
        <span>
          <span class="label">Redact sensitive values</span>
          <span class="desc">
            Replace passwords / tokens / secrets with
            <code>&lt;REDACTED:RECOSPEC_*&gt;</code> placeholders.
          </span>
        </span>
      </label>
    </fieldset>

    <div class="actions">
      <button class="secondary" id="cancel">Cancel</button>
      <button class="primary" id="apply">Apply</button>
    </div>

    <p class="footnote">
      Choices are not remembered between runs. You can re-open this picker any time by
      re-running <strong>Recospec: Apply Existing JSON…</strong>.
    </p>

    <script nonce="${nonce}">
      (function () {
        const vscode = acquireVsCodeApi()
        const meta = ${metaPayload}

        document.getElementById('subtitle').textContent =
          'Session: ' + meta.sessionName + '  ·  ' + meta.stepCount + ' steps'

        const metaDl = document.getElementById('meta')
        const rows = [
          ['Session', meta.sessionName],
          ['Framework', meta.frameworkLabel],
          ['Steps', String(meta.stepCount)],
          ['Network requests', meta.hasNetworkSteps ? 'captured' : 'none'],
        ]
        for (const [key, value] of rows) {
          const dt = document.createElement('dt')
          dt.textContent = key
          const dd = document.createElement('dd')
          dd.textContent = value
          metaDl.appendChild(dt)
          metaDl.appendChild(dd)
        }

        const pageObjects = document.getElementById('opt-page-objects')
        const test = document.getElementById('opt-test')
        const bdd = document.getElementById('opt-bdd')
        const bddWrap = document.getElementById('opt-bdd-wrap')
        const mocks = document.getElementById('opt-mocks')
        const mocksWrap = document.getElementById('opt-mocks-wrap')
        const claudePrompt = document.getElementById('opt-claude-prompt')
        const promptModeWrap = document.getElementById('prompt-mode-wrap')
        const redact = document.getElementById('opt-redact')
        const applyBtn = document.getElementById('apply')

        // Pre-fill: enable mocks iff the recording actually has network steps.
        mocks.checked = meta.hasNetworkSteps
        if (!meta.hasNetworkSteps) {
          mocks.disabled = true
          mocksWrap.classList.add('disabled')
        }
        if (!meta.supportsBdd) {
          bdd.disabled = true
          bddWrap.classList.add('disabled')
        }

        function refresh() {
          // BDD and mocks live in the test spec, so they only matter when the
          // test spec is checked.
          const testOn = test.checked
          bdd.disabled = !testOn || !meta.supportsBdd
          mocks.disabled = !testOn || !meta.hasNetworkSteps
          bddWrap.classList.toggle('disabled', bdd.disabled)
          mocksWrap.classList.toggle('disabled', mocks.disabled)
          if (bdd.disabled) bdd.checked = false
          if (mocks.disabled && !meta.hasNetworkSteps) mocks.checked = false

          // Prompt-mode radios and redact toggle only matter when prompt is on.
          const promptOn = claudePrompt.checked
          promptModeWrap.classList.toggle('hidden', !promptOn)
          redact.disabled = !promptOn

          // Apply is disabled when the user has unchecked everything.
          applyBtn.disabled = !pageObjects.checked && !testOn && !promptOn
        }

        pageObjects.addEventListener('change', refresh)
        test.addEventListener('change', refresh)
        claudePrompt.addEventListener('change', refresh)
        refresh()

        applyBtn.addEventListener('click', () => {
          const mode = document.querySelector('input[name="prompt-mode"]:checked')
          vscode.postMessage({
            type: 'submit',
            choices: {
              pageObjects: pageObjects.checked,
              test: test.checked,
              claudePrompt: claudePrompt.checked,
              promptMode: mode ? mode.value : 'slash',
              bdd: bdd.checked,
              mocks: mocks.checked,
              redact: redact.checked,
            },
          })
        })

        document.getElementById('cancel').addEventListener('click', () => {
          vscode.postMessage({ type: 'cancel' })
        })

        window.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') vscode.postMessage({ type: 'cancel' })
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !applyBtn.disabled) {
            applyBtn.click()
          }
        })
      })()
    </script>
  </body>
</html>`
}
