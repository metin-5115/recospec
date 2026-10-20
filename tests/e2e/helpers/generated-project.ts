import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
export const REPO_ROOT = resolve(__dirname, '../../..')

export interface FixtureServer {
  /** `http://127.0.0.1:<port>` — no trailing slash. */
  baseUrl: string
  close(): Promise<void>
}

/** Serve one offline fixture file for every path, so a client-side route change still resolves. */
export async function serveFixture(fixtureFile: string): Promise<FixtureServer> {
  const html = readFileSync(resolve(REPO_ROOT, 'tests/fixtures', fixtureFile))
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((done) => {
        server.close(() => done())
        server.closeAllConnections()
      }),
  }
}

export interface CommandResult {
  status: number | null
  output: string
}

/**
 * Run a command without a shell and return its combined output (never rejects on a non-zero exit).
 * Asynchronous on purpose: the fixture server lives in this process and must keep answering.
 */
export function run(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
  timeoutMs = 180_000,
): Promise<CommandResult> {
  // A nested `playwright test` must not inherit the outer runner's worker/config wiring.
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !/^(PW_|PLAYWRIGHT_)/.test(k)),
  ) as Record<string, string>
  return new Promise((done) => {
    let output = ''
    const child = spawn(command, args, { cwd, env: { ...inherited, CI: '1', ...env } })
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.on('error', (err) => {
      clearTimeout(timer)
      done({ status: null, output: output + String(err) })
    })
    child.on('close', (status) => {
      clearTimeout(timer)
      done({ status, output })
    })
  })
}

/**
 * Create an empty Playwright project in a temp dir. `node_modules` is a link to the repo's, so the
 * generated tests resolve `@playwright/test` without a second install.
 */
export function createPlaywrightProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'recospec-generated-'))
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      { name: 'recospec-generated', private: true, devDependencies: { '@playwright/test': '*' } },
      null,
      2,
    ),
  )
  writeFileSync(
    join(dir, 'playwright.config.ts'),
    [
      "import { defineConfig } from '@playwright/test'",
      '',
      'export default defineConfig({',
      "  testDir: '.',",
      "  testMatch: '**/*.spec.ts',",
      '  retries: 0,',
      '  use: { baseURL: process.env.BASE_URL, headless: true },',
      '})',
      '',
    ].join('\n'),
  )
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction')
  return dir
}

/** Every file under `dir` (relative paths, forward slashes), skipping the linked node_modules. */
export function listFiles(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full, base))
    else
      out.push(
        full
          .slice(base.length + 1)
          .split('\\')
          .join('/'),
      )
  }
  return out
}

/** Run the built CLI (`pnpm build:cli`) as `recospec add <json> <projectDir>`. */
export function recospecAdd(jsonPath: string, projectDir: string): Promise<CommandResult> {
  const cli = resolve(REPO_ROOT, 'dist/cli/index.js')
  if (!existsSync(cli)) throw new Error('dist/cli/index.js is missing — run `pnpm build:cli` first')
  return run(process.execPath, [cli, 'add', jsonPath, projectDir, '--force'], projectDir)
}
