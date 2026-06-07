import * as vscode from 'vscode'
import {
  makeNonce,
  renderOutputPickerHtml,
  type PickerChoices,
  type PickerMeta,
} from './output-picker-html'

export type { PickerChoices, PickerMeta } from './output-picker-html'

type PickerMessage = { type: 'submit'; choices: PickerChoices } | { type: 'cancel' }

/**
 * Open the Output Picker webview and resolve with the user's choices, or
 * `null` if the panel was dismissed (cancel button, close, or Escape key).
 *
 * The panel is single-shot — disposed as soon as a terminal message arrives.
 * CSP locks the webview to its own origin + a per-load script nonce; the
 * inline payload is `</script>`-safe (see `safeJsonInScript`).
 */
export function showOutputPicker(meta: PickerMeta): Promise<PickerChoices | null> {
  const panel = vscode.window.createWebviewPanel(
    'recospec.outputPicker',
    'Recospec — Apply',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
      // Scope which fs roots the webview can load assets from. We do not load
      // any local resources today — this keeps the door closed.
      localResourceRoots: [],
    },
  )

  const nonce = makeNonce()
  panel.webview.html = renderOutputPickerHtml(meta, panel.webview.cspSource, nonce)

  return new Promise<PickerChoices | null>((resolve) => {
    let settled = false
    const settle = (value: PickerChoices | null) => {
      if (settled) return
      settled = true
      resolve(value)
      panel.dispose()
    }

    panel.webview.onDidReceiveMessage((message: PickerMessage) => {
      if (message.type === 'submit') {
        settle(sanitizeChoices(message.choices, meta))
      } else if (message.type === 'cancel') {
        settle(null)
      }
    })

    panel.onDidDispose(() => settle(null))
  })
}

/**
 * Re-clamp choices server-side so a webview that ignored its `disabled`
 * attributes can't sneak a forbidden combo through. The webview is trusted
 * code we ship ourselves, but the contract should still hold without it.
 */
function sanitizeChoices(choices: PickerChoices, meta: PickerMeta): PickerChoices {
  return {
    testCode: Boolean(choices.testCode),
    claudePrompt: Boolean(choices.claudePrompt),
    promptMode:
      choices.promptMode === 'slash' ||
      choices.promptMode === 'claude-md' ||
      choices.promptMode === 'prompt'
        ? choices.promptMode
        : 'slash',
    bdd: Boolean(choices.bdd) && meta.supportsBdd && Boolean(choices.testCode),
    mocks: Boolean(choices.mocks) && meta.hasNetworkSteps && Boolean(choices.testCode),
    redact: Boolean(choices.redact),
  }
}
