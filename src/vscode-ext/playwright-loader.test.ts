import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  defaultResolveFrom,
  isMissingBrowserError,
  loadPlaywright,
  PlaywrightMissingError,
} from './playwright-loader'
import { PLAYWRIGHT_INSTALL_COMMAND } from '@shared/constants'

let root: string

/** Real Node resolution, but ignoring anything outside the temp root (e.g. a Playwright in the user's home). */
function confined(dir: string, name: string): string | undefined {
  const resolved = defaultResolveFrom(dir, name)
  return resolved?.startsWith(root) ? resolved : undefined
}

function installFakePackage(nodeModulesDir: string, name: string, marker: string): void {
  const dir = join(nodeModulesDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name, version: '0.0.0', main: 'index.js' }),
  )
  writeFileSync(
    join(dir, 'index.js'),
    `module.exports = { chromium: { marker: ${JSON.stringify(marker)} } }`,
  )
}

function makeDir(name: string): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'recospec-pw-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('loadPlaywright', () => {
  it('resolves Playwright from the first search directory that has it', () => {
    const workspace = makeDir('workspace')
    installFakePackage(join(workspace, 'node_modules'), '@playwright/test', 'workspace')
    const extension = makeDir('extension')
    installFakePackage(join(extension, 'node_modules'), '@playwright/test', 'extension')

    const pw = loadPlaywright({
      searchDirs: [workspace, extension],
      globalRoot: () => undefined,
      resolveFrom: confined,
    })
    expect((pw.chromium as unknown as { marker: string }).marker).toBe('workspace')
  })

  it('skips directories without Playwright and finds a later one', () => {
    const empty = makeDir('empty')
    const extension = makeDir('extension')
    installFakePackage(join(extension, 'node_modules'), '@playwright/test', 'extension')

    const pw = loadPlaywright({
      searchDirs: [empty, extension],
      globalRoot: () => undefined,
      resolveFrom: confined,
    })
    expect((pw.chromium as unknown as { marker: string }).marker).toBe('extension')
  })

  it('falls back to the global npm root', () => {
    const globalRoot = join(makeDir('global'), 'node_modules')
    installFakePackage(globalRoot, '@playwright/test', 'global')

    const pw = loadPlaywright({
      searchDirs: [makeDir('workspace')],
      globalRoot: () => globalRoot,
      resolveFrom: confined,
    })
    expect((pw.chromium as unknown as { marker: string }).marker).toBe('global')
  })

  it('accepts playwright-core when @playwright/test is absent', () => {
    const workspace = makeDir('workspace')
    installFakePackage(join(workspace, 'node_modules'), 'playwright-core', 'core')

    const pw = loadPlaywright({
      searchDirs: [workspace],
      globalRoot: () => undefined,
      resolveFrom: confined,
    })
    expect((pw.chromium as unknown as { marker: string }).marker).toBe('core')
  })

  it('ignores a package that does not export chromium', () => {
    const workspace = makeDir('workspace')
    const dir = join(workspace, 'node_modules', '@playwright', 'test')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: '@playwright/test', main: 'index.js' }),
    )
    writeFileSync(join(dir, 'index.js'), 'module.exports = {}')

    expect(() =>
      loadPlaywright({
        searchDirs: [workspace],
        globalRoot: () => undefined,
        resolveFrom: confined,
      }),
    ).toThrow(PlaywrightMissingError)
  })

  it('throws an actionable error listing where it looked', () => {
    const workspace = makeDir('workspace')
    let caught: unknown
    try {
      loadPlaywright({
        searchDirs: [workspace],
        globalRoot: () => undefined,
        resolveFrom: confined,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(PlaywrightMissingError)
    const error = caught as PlaywrightMissingError
    expect(error.searchedDirs).toContain(workspace)
    expect(error.message).toContain(PLAYWRIGHT_INSTALL_COMMAND)
    expect(error.message).toContain(workspace)
  })
})

describe('isMissingBrowserError', () => {
  it('recognises the Playwright "executable does not exist" failure', () => {
    const err = new Error(
      "browserType.launchPersistentContext: Executable doesn't exist at C:/x/chrome.exe\n" +
        'Looks like Playwright Test or Playwright was just installed or updated.\n' +
        'Please run the following command to download new browsers:\n    npx playwright install',
    )
    expect(isMissingBrowserError(err)).toBe(true)
  })

  it('does not misclassify unrelated launch failures', () => {
    expect(
      isMissingBrowserError(new Error('Target page, context or browser has been closed')),
    ).toBe(false)
    expect(isMissingBrowserError('nope')).toBe(false)
  })
})
