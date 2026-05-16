import { chromium, type BrowserContext } from '@playwright/test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export class BundledExtensionMissingError extends Error {
  constructor(public readonly searchedPath: string) {
    super(
      `Bundled Chrome extension missing at ${searchedPath}. Run ` +
        '`pnpm build && pnpm build:vscode` from the repo root so the Chrome ' +
        'extension is copied alongside the VS Code extension.',
    )
    this.name = 'BundledExtensionMissingError'
  }
}

export interface LaunchOptions {
  /** Absolute path to the unpacked Chrome extension directory. */
  extensionPath: string
  /**
   * Optional URL to navigate to in the first tab. When omitted the
   * Chromium default new-tab page is used and the user can navigate
   * themselves.
   */
  startUrl?: string
  /**
   * Reuse a known persistent user-data dir to keep cookies between
   * recordings. When omitted, a fresh temp dir is created per launch.
   */
  userDataDir?: string
}

export interface LaunchedBrowser {
  context: BrowserContext
  /** Absolute user-data dir used by this session — exposed so the host can clean up if needed. */
  userDataDir: string
}

/**
 * Resolve the bundled Chrome extension directory relative to the VS Code
 * extension root. In dev mode the file copy plugin in
 * `vite.config.vscode.ts` mirrors `dist/` → `vscode-extension/chrome-ext/`
 * after every `pnpm build:vscode`. In the installed VSIX, `chrome-ext/`
 * lives directly inside the extension folder.
 */
export function resolveBundledExtensionPath(vscodeExtensionRoot: string): string {
  const bundled = resolve(vscodeExtensionRoot, 'chrome-ext')
  if (!existsSync(bundled)) {
    throw new BundledExtensionMissingError(bundled)
  }
  return bundled
}

/**
 * Launch a Chromium persistent context with the PlayForge Chrome extension
 * pre-loaded. The context is returned so the caller can later evaluate
 * code in the service worker (recording-bridge.ts) and dispose the
 * browser when recording completes.
 *
 * Manifest V3 extensions must run in non-headless mode — service workers
 * are not started by Chromium under headless. We force `headless: false`.
 */
export async function launchChromium(opts: LaunchOptions): Promise<LaunchedBrowser> {
  if (!existsSync(opts.extensionPath)) {
    throw new BundledExtensionMissingError(opts.extensionPath)
  }

  const userDataDir = opts.userDataDir ?? mkdtempSync(join(tmpdir(), 'playforge-rec-'))
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${opts.extensionPath}`,
      `--load-extension=${opts.extensionPath}`,
      // Side panel must be opened by user action; this hint surfaces the
      // PlayForge action icon prominently so the user can click it.
      '--no-first-run',
      '--no-default-browser-check',
    ],
    viewport: null,
  })

  if (opts.startUrl) {
    const page = context.pages()[0] ?? (await context.newPage())
    await page.goto(opts.startUrl).catch(() => {
      // Navigation can fail for many reasons (offline, bad URL). We
      // surface the launched context regardless so the user can still
      // record by typing a URL manually.
    })
  }

  return { context, userDataDir }
}
