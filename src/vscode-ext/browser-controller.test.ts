import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchChromium } from './browser-controller'
import { ChromiumMissingError } from './playwright-loader'

let root: string
let workspace: string
let extensionPath: string

/** Installs a fake `@playwright/test` whose `launchPersistentContext` fails with `launchError`. */
function installFakePlaywright(launchError: string): void {
  const dir = join(workspace, 'node_modules', '@playwright', 'test')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: '@playwright/test', version: '0.0.0', main: 'index.js' }),
  )
  writeFileSync(
    join(dir, 'index.js'),
    `module.exports = { chromium: { launchPersistentContext: async () => { throw new Error(${JSON.stringify(launchError)}) } } }`,
  )
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'recospec-launch-'))
  workspace = join(root, 'workspace')
  extensionPath = join(root, 'chrome-ext')
  mkdirSync(workspace, { recursive: true })
  mkdirSync(extensionPath, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('launchChromium', () => {
  it('reports a missing Chromium download as an actionable ChromiumMissingError', async () => {
    installFakePlaywright(
      "browserType.launchPersistentContext: Executable doesn't exist at C:/x/chrome.exe\n" +
        'Please run the following command to download new browsers:\n    npx playwright install',
    )
    await expect(launchChromium({ extensionPath, searchDirs: [workspace] })).rejects.toBeInstanceOf(
      ChromiumMissingError,
    )
  })

  it('lets unrelated launch failures through unchanged', async () => {
    installFakePlaywright('Target page, context or browser has been closed')
    const error = await launchChromium({ extensionPath, searchDirs: [workspace] }).catch(
      (err: unknown) => err,
    )
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(ChromiumMissingError)
    expect((error as Error).message).toContain('has been closed')
  })
})
