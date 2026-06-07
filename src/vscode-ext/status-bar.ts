import * as vscode from 'vscode'

/**
 * Lightweight wrapper around a single status-bar item. The host swaps the
 * label between `idle` and `busy <task>` while commands run so users see
 * that something is happening even when the operation finishes quickly.
 */
export interface RecospecStatusBar extends vscode.Disposable {
  setIdle(): void
  setBusy(task: string): void
  setFramework(framework: string | null): void
}

export function createStatusBar(): RecospecStatusBar {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  item.text = '$(record) Recospec'
  item.tooltip = 'Recospec — idle'
  item.command = 'recospec.record'
  item.show()

  let framework: string | null = null

  const renderIdle = () => {
    const suffix = framework ? ` · ${framework}` : ''
    item.text = `$(record) Recospec${suffix}`
    item.tooltip = framework ? `Recospec — idle · framework: ${framework}` : 'Recospec — idle'
  }

  renderIdle()

  return {
    setIdle: renderIdle,
    setBusy: (task: string) => {
      item.text = `$(sync~spin) Recospec: ${task}`
      item.tooltip = `Recospec — ${task}`
    },
    setFramework: (next: string | null) => {
      framework = next
      renderIdle()
    },
    dispose: () => item.dispose(),
  }
}
