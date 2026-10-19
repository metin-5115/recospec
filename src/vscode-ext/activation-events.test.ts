import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

interface ExtensionManifest {
  activationEvents: string[]
  contributes: {
    commands: { command: string }[]
    views: Record<string, { id: string }[]>
  }
}

const manifestPath = fileURLToPath(new URL('../../vscode-extension/package.json', import.meta.url))
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ExtensionManifest

describe('VS Code extension activation events', () => {
  it('does not load the bundle on every startup', () => {
    expect(manifest.activationEvents).not.toContain('onStartupFinished')
    expect(manifest.activationEvents).not.toContain('*')
  })

  it('activates when a contributed command runs', () => {
    for (const { command } of manifest.contributes.commands) {
      expect(manifest.activationEvents, command).toContain(`onCommand:${command}`)
    }
  })

  it('activates when a contributed view opens', () => {
    for (const view of Object.values(manifest.contributes.views).flat()) {
      expect(manifest.activationEvents, view.id).toContain(`onView:${view.id}`)
    }
  })

  it('activates in workspaces that already carry a Recospec config', () => {
    expect(manifest.activationEvents).toContain('workspaceContains:.recospecrc.json')
  })
})
