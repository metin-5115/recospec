import * as vscode from 'vscode'

/**
 * Lightweight wrapper around a single status-bar item. The host swaps the
 * label between `idle` and `busy <task>` while commands run so users see
 * that something is happening even when the operation finishes quickly.
 */
export interface PlayforgeStatusBar extends vscode.Disposable {
  setIdle(): void
  setBusy(task: string): void
  setFramework(framework: string | null): void
}

export function createStatusBar(): PlayforgeStatusBar {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  item.text = '$(record) PlayForge'
  item.tooltip = 'PlayForge — idle'
  item.command = 'playforge.record'
  item.show()

  let framework: string | null = null

  const renderIdle = () => {
    const suffix = framework ? ` · ${framework}` : ''
    item.text = `$(record) PlayForge${suffix}`
    item.tooltip = framework ? `PlayForge — idle · framework: ${framework}` : 'PlayForge — idle'
  }

  renderIdle()

  return {
    setIdle: renderIdle,
    setBusy: (task: string) => {
      item.text = `$(sync~spin) PlayForge: ${task}`
      item.tooltip = `PlayForge — ${task}`
    },
    setFramework: (next: string | null) => {
      framework = next
      renderIdle()
    },
    dispose: () => item.dispose(),
  }
}
