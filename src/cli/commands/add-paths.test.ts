import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAdd } from './add'
import type { ConflictReporter } from '@codegen/apply/conflict-reporter'
import type { JsonExportPayload } from '@codegen/export/json-export'
import type { RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'

function makeSession(): Session {
  return {
    sessionId: 'session-1',
    name: 'Login Flow',
    state: 'stopped',
    startUrl: 'https://example.com/login',
    startedAt: 0,
    metadata: { userAgent: 'x', viewport: { width: 0, height: 0 }, timezone: 'UTC' },
    config: { captureClicks: true, captureInputs: true, captureNavigation: true },
    iterationNumber: 1,
    flowSignature: 'sig',
  }
}

function clickAction(): RecordedAction {
  return {
    actionId: 'a0',
    sessionId: 'session-1',
    sequenceNumber: 0,
    type: 'click',
    timestamp: 0,
    pageUrl: 'https://example.com/login',
    target: {
      primaryLocator: {
        strategy: 'aria-label',
        selector: '[aria-label="Sign In"]',
        framework: {},
        score: 100,
        matchCount: 1,
      },
      fallbackLocators: [],
      elementSnapshot: {
        tagName: 'button',
        attributes: { type: 'submit', 'aria-label': 'Sign In' },
        textContent: 'Sign In',
      },
    },
  }
}

function makePayload(): JsonExportPayload {
  return { exportedAt: 0, formatVersion: 1, session: makeSession(), actions: [clickAction()] }
}

/** A reporter that should never fire for a fresh (empty) target dir. */
const failingReporter: ConflictReporter = {
  resolve: () => {
    throw new Error('reporter should not be called for new files')
  },
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(String((e as { parentPath?: string }).parentPath ?? dir), e.name))
    .map((p) => p.replace(dir, '').replace(/\\/g, '/'))
}

let tmp: string
let jsonPath: string
let logSpy: ReturnType<typeof vi.spyOn>

function writeRc(rc: object): void {
  writeFileSync(join(tmp, '.recospecrc.json'), JSON.stringify(rc), 'utf8')
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'recospec-paths-'))
  jsonPath = join(tmp, 'session.json')
  writeFileSync(jsonPath, JSON.stringify(makePayload()), 'utf8')
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  logSpy.mockRestore()
  rmSync(tmp, { recursive: true, force: true })
})

describe('runAdd honours the rc paths', () => {
  it('writes page objects and specs to the configured folders', async () => {
    writeRc({
      version: 1,
      framework: 'playwright-ts',
      paths: { pagesDir: 'e2e/po', testsDir: './e2e/specs/' },
    })
    await runAdd({ json: jsonPath, projectDir: tmp }, failingReporter)

    const files = listFiles(tmp)
    expect(files).toContain('/e2e/po/LoginPage.ts')
    expect(files).toContain('/e2e/specs/login-flow.spec.ts')
    expect(files.some((f) => f.startsWith('/pages/') || f.startsWith('/tests/'))).toBe(false)
  })

  it('imports page objects from where they actually were written', async () => {
    writeRc({ framework: 'playwright-ts', paths: { pagesDir: 'po', testsDir: 'tests/e2e' } })
    await runAdd({ json: jsonPath, projectDir: tmp }, failingReporter)

    const spec = readFileSync(join(tmp, 'tests', 'e2e', 'login-flow.spec.ts'), 'utf8')
    const imported = spec.match(/from '(\.[^']+\/LoginPage)'/)?.[1]
    expect(imported).toBe('../../po/LoginPage')
    expect(existsSync(join(tmp, 'tests', 'e2e', `${imported}.ts`))).toBe(true)
  })

  it('routes BDD files through featuresDir', async () => {
    writeRc({ framework: 'playwright-ts', paths: { featuresDir: 'e2e/bdd' } })
    await runAdd({ json: jsonPath, projectDir: tmp, bdd: true }, failingReporter)

    const files = listFiles(tmp)
    expect(files).toContain('/e2e/bdd/login-flow.feature')
    expect(files).toContain('/e2e/bdd/steps/login-flow.steps.ts')
  })

  it('keeps the standard layout for folders the rc does not mention', async () => {
    writeRc({ framework: 'playwright-ts', paths: { testsDir: 'e2e' } })
    await runAdd({ json: jsonPath, projectDir: tmp }, failingReporter)

    const files = listFiles(tmp)
    expect(files).toContain('/pages/LoginPage.ts')
    expect(files).toContain('/e2e/login-flow.spec.ts')
  })

  it('refuses a folder that leaves the project and writes nothing', async () => {
    writeRc({ framework: 'playwright-ts', paths: { pagesDir: '../outside' } })
    await expect(runAdd({ json: jsonPath, projectDir: tmp }, failingReporter)).rejects.toThrow(
      /relative folder inside the project/,
    )
    expect(listFiles(tmp).filter((f) => f.endsWith('.ts'))).toEqual([])
  })

  it('applies the folders to Selenium Python', async () => {
    writeRc({ framework: 'selenium-py', paths: { pagesDir: 'app/pages', testsDir: 'app/tests' } })
    await runAdd({ json: jsonPath, projectDir: tmp }, failingReporter)

    const files = listFiles(tmp)
    expect(files).toContain('/app/pages/login_page.py')
    expect(files).toContain('/app/tests/test_login_flow.py')
    const test = readFileSync(join(tmp, 'app', 'tests', 'test_login_flow.py'), 'utf8')
    expect(test).toContain('from app.pages.login_page import LoginPage')
  })

  it('applies the folders to Cypress', async () => {
    writeRc({ framework: 'cypress', paths: { pagesDir: 'cy/po', testsDir: 'cy/specs' } })
    await runAdd({ json: jsonPath, projectDir: tmp }, failingReporter)

    const files = listFiles(tmp)
    expect(files).toContain('/cy/po/LoginPage.js')
    expect(files).toContain('/cy/specs/login-flow.cy.js')
  })

  it('maps Selenium Java folders to packages', async () => {
    writeRc({
      framework: 'selenium-java',
      paths: { pagesDir: 'src/main/java/com/acme/pages', testsDir: 'src/test/java/com/acme/tests' },
    })
    await runAdd({ json: jsonPath, projectDir: tmp }, failingReporter)

    const page = readFileSync(
      join(tmp, 'src', 'main', 'java', 'com', 'acme', 'pages', 'LoginPage.java'),
      'utf8',
    )
    expect(page).toContain('package com.acme.pages;')
  })

  it('rejects Selenium Java folders outside the Maven source roots', async () => {
    writeRc({ framework: 'selenium-java', paths: { pagesDir: 'app/pages' } })
    await expect(runAdd({ json: jsonPath, projectDir: tmp }, failingReporter)).rejects.toThrow(
      /src\/main\/java/,
    )
  })

  it('ignores non-string path settings instead of crashing', async () => {
    writeRc({ framework: 'playwright-ts', paths: { pagesDir: 42, testsDir: null } })
    await runAdd({ json: jsonPath, projectDir: tmp }, failingReporter)

    expect(listFiles(tmp)).toContain('/pages/LoginPage.ts')
  })
})
