import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { REPO_ROOT, run, serveFixture, type FixtureServer } from './helpers/generated-project'
import { renderScaffold } from '../../src/codegen/adapters/playwright-ts/scaffold'
import { renderFillValueExpr } from '../../src/codegen/adapters/playwright-ts/fill-value'
import type { IRElement } from '../../src/codegen/ir/types'

const passwordField: IRElement = {
  name: 'passwordInput',
  locatorStrategy: 'label',
  locatorValue: "'Password'",
  tagName: 'input',
  inputType: 'password',
}

// The credential the user writes into .env — it must reach the page, not the "change-me" default.
const DOTENV_PASSWORD = 'from-dotenv-9f2c'

// "Fill in the example file -> run -> the test uses that value": the unedited generated
// scaffold (its own playwright.config.ts) running a spec that fills a password the way generated
// specs do. Needs no extension build, only Playwright's Chromium; slow because it starts a second one.
test.describe('Generated Playwright credentials @slow', () => {
  test.setTimeout(180_000)

  let server: FixtureServer
  let projectDir: string | undefined

  test.beforeAll(async () => {
    server = await serveFixture('login-search.html')
  })

  test.afterAll(async () => {
    await server.close()
    if (projectDir) rmSync(projectDir, { recursive: true, force: true })
  })

  test('the value written to .env is the one typed into the page', async () => {
    projectDir = mkdtempSync(join(tmpdir(), 'recospec-env-run-'))
    const scaffold = renderScaffold({
      testData: {
        params: [
          {
            key: 'passwordInput',
            name: 'password',
            isSecret: true,
            defaultValue: 'change-me',
            useEnvVar: true,
            envVarName: 'RECOSPEC_PASSWORD',
          },
        ],
      },
    })
    for (const f of scaffold) {
      if (f.filename.endsWith('.gitkeep')) continue
      mkdirSync(dirname(join(projectDir, f.filename)), { recursive: true })
      writeFileSync(join(projectDir, f.filename), f.content)
    }
    const fillValue = renderFillValueExpr(passwordField, 'hunter2', undefined)
    mkdirSync(join(projectDir, 'tests'), { recursive: true })
    writeFileSync(
      join(projectDir, 'tests', 'login.spec.ts'),
      [
        "import { test, expect } from '@playwright/test';",
        '',
        "test('login uses the credential from .env', async ({ page }) => {",
        "  await page.goto('/');",
        `  await page.getByLabel('Password').fill(${fillValue});`,
        `  await expect(page.getByLabel('Password')).toHaveValue(${JSON.stringify(DOTENV_PASSWORD)});`,
        '});',
        '',
      ].join('\n'),
    )
    writeFileSync(join(projectDir, '.env'), `RECOSPEC_PASSWORD=${DOTENV_PASSWORD}\n`)
    symlinkSync(join(REPO_ROOT, 'node_modules'), join(projectDir, 'node_modules'), 'junction')

    const cli = join(projectDir, 'node_modules/@playwright/test/cli.js')
    const result = await run(process.execPath, [cli, 'test'], projectDir, {
      BASE_URL: server.baseUrl,
    })
    expect(result.status, result.output).toBe(0)
    expect(result.output).toMatch(/1 passed/)
  })
})
