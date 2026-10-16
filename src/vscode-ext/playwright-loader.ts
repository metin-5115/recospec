import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { PLAYWRIGHT_INSTALL_COMMAND, PLAYWRIGHT_PACKAGE_NAMES } from '@shared/constants'

/** The slice of Playwright the recorder needs. */
export type PlaywrightModule = Pick<typeof import('@playwright/test'), 'chromium'>

export class PlaywrightMissingError extends Error {
  constructor(public readonly searchedDirs: string[]) {
    super(
      'Playwright was not found, and "Record Flow" needs it to open Chromium. ' +
        `Install it in your project with: ${PLAYWRIGHT_INSTALL_COMMAND}\n` +
        `Searched: ${searchedDirs.join(', ') || '(nothing)'}`,
    )
    this.name = 'PlaywrightMissingError'
  }
}

export class ChromiumMissingError extends Error {
  constructor(cause: unknown) {
    super(
      'Playwright is installed but its Chromium build is not. ' +
        `Download it with: ${PLAYWRIGHT_INSTALL_COMMAND}`,
      { cause },
    )
    this.name = 'ChromiumMissingError'
  }
}

export interface LoadPlaywrightOptions {
  /** Directories to resolve from, most specific first (workspace, then extension folder). */
  searchDirs: string[]
  /** Global `node_modules` directory; injected for tests, defaults to `npm root -g`. */
  globalRoot?: () => string | undefined
  /** Resolves a package entry file starting from a directory; injected for tests. */
  resolveFrom?: (dir: string, name: string) => string | undefined
}

export function getGlobalNpmRoot(): string | undefined {
  const result = spawnSync('npm', ['root', '-g'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 5_000,
  })
  const root = result.status === 0 ? result.stdout.trim() : ''
  return root.length > 0 ? root : undefined
}

/** Node resolution from `dir`: its own `node_modules`, then every parent's. */
export function defaultResolveFrom(dir: string, name: string): string | undefined {
  try {
    return createRequire(join(dir, 'recospec-resolver.js')).resolve(name, { paths: [dir] })
  } catch {
    return undefined
  }
}

function tryRequire(
  fromDir: string,
  resolveFrom: NonNullable<LoadPlaywrightOptions['resolveFrom']>,
): PlaywrightModule | undefined {
  for (const name of PLAYWRIGHT_PACKAGE_NAMES) {
    const entry = resolveFrom(fromDir, name)
    if (!entry) continue
    try {
      const loaded = createRequire(entry)(entry) as Partial<PlaywrightModule> | undefined
      if (loaded?.chromium) return loaded as PlaywrightModule
    } catch {
      // Broken install — try the next candidate.
    }
  }
  return undefined
}

/**
 * Load Playwright lazily from the user's environment. The VSIX deliberately does not bundle it
 * (native browsers, test runner), and a top-level `require` would make the whole extension fail
 * to activate for anyone without it — so resolution happens only when recording starts.
 */
export function loadPlaywright(options: LoadPlaywrightOptions): PlaywrightModule {
  const resolveFrom = options.resolveFrom ?? defaultResolveFrom
  const searched = [...options.searchDirs]
  for (const dir of searched) {
    const found = tryRequire(dir, resolveFrom)
    if (found) return found
  }

  const globalRoot = (options.globalRoot ?? getGlobalNpmRoot)()
  if (globalRoot) {
    searched.push(globalRoot)
    // `paths` entries are start points whose `node_modules` is searched, so use the parent.
    const found = tryRequire(dirname(globalRoot), resolveFrom)
    if (found) return found
  }

  throw new PlaywrightMissingError(searched)
}

/** Playwright's error when the browser binary was never downloaded. */
export function isMissingBrowserError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /Executable doesn't exist|npx playwright install|playwright install/i.test(err.message)
  )
}
