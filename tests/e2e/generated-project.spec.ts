import { test, expect } from '@playwright/test'
import type { BrowserContext, Page, Worker } from '@playwright/test'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { loadExtension, getServiceWorker } from './helpers/extension'
import {
  createPlaywrightProject,
  listFiles,
  recospecAdd,
  run,
  serveFixture,
  type FixtureServer,
} from './helpers/generated-project'

interface ExportedPayload {
  session: { sessionId: string }
  actions: Array<{ type: string }>
}

type ExportFn = (sessionId?: string) => Promise<ExportedPayload | null>

function actionsOf(exported: ExportedPayload | null): ExportedPayload['actions'] {
  return exported?.actions ?? []
}

async function exportSession(worker: Worker): Promise<ExportedPayload | null> {
  return worker.evaluate(async () =>
    (globalThis as unknown as { __recospecExport: ExportFn }).__recospecExport(),
  )
}

/** Start recording the page's tab the way the side panel does (an extension page speaks the same bus). */
async function startRecording(context: BrowserContext, worker: Worker, page: Page): Promise<Page> {
  const extensionId = new URL(worker.url()).host
  const panel = await context.newPage()
  await panel.goto(`chrome-extension://${extensionId}/src/side-panel/side-panel.html`)
  await page.bringToFront()

  const tabId = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' })
    return tab?.id
  })
  expect(tabId).toBeDefined()

  await panel.evaluate(
    async (id) =>
      chrome.runtime.sendMessage({
        type: 'SESSION_START',
        tabId: id,
        metadata: {
          userAgent: navigator.userAgent,
          viewport: { width: 1280, height: 720 },
          timezone: 'UTC',
        },
        config: { captureClicks: true, captureInputs: true, captureNavigation: true },
      }),
    tabId,
  )
  // Reload so the content script attaches with recording already on.
  await page.reload()
  return panel
}

// "Record -> generate -> run -> green": the product's promise, proven end to end.
// Needs `pnpm build:e2e` and `pnpm build:cli`, and runs a second Playwright inside a temp project,
// so it is tagged @slow and runs nightly (see .github/workflows/nightly.yml).
test.describe('Generated project @slow', () => {
  test.setTimeout(240_000)

  let server: FixtureServer
  let projectDir: string | undefined

  test.beforeAll(async () => {
    server = await serveFixture('login-search.html')
  })

  test.afterAll(async () => {
    await server.close()
    // Set RECOSPEC_KEEP_PROJECT=1 to inspect what was generated.
    if (projectDir && !process.env.RECOSPEC_KEEP_PROJECT) {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  test('a recorded login + search flow passes with `npx playwright test`', async () => {
    const context = await loadExtension()
    const worker = await getServiceWorker(context)
    const page = await context.newPage()
    await page.goto(server.baseUrl)
    await page.bringToFront()
    const panel = await startRecording(context, worker, page)
    await page.bringToFront()

    // --- the flow a user would record ---
    await page.getByLabel('Email').click()
    await page.getByLabel('Email').pressSequentially('ada@example.com', { delay: 15 })
    await page.getByLabel('Password').click()
    await page.getByLabel('Password').pressSequentially('correct-horse', { delay: 15 })
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByLabel('Search products')).toBeVisible()
    await page.getByLabel('Search products').click()
    await page.getByLabel('Search products').pressSequentially('kettle', { delay: 15 })
    await page.getByLabel('Search products').press('Enter')
    await expect(page.getByTestId('result-count')).toHaveText('2 results')

    await expect
      .poll(async () => actionsOf(await exportSession(worker)).length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(6)

    // --- add an element assertion, like clicking "Add assertion" on the result count ---
    const sessionId = (await exportSession(worker))?.session.sessionId
    expect(sessionId).toBeTruthy()
    await panel.evaluate(
      async ({ id, url }) =>
        chrome.runtime.sendMessage({
          type: 'ASSERTION_ADD',
          sessionId: id,
          suggestion: { type: 'text', label: 'Result count', expected: '2 results' },
          locatorBundle: {
            primary: {
              strategy: 'testid',
              selector: 'result-count',
              framework: {},
              score: 95,
              matchCount: 1,
            },
            fallbacks: [],
            rejected: [],
          },
          elementSnapshot: {
            tagName: 'p',
            attributes: { 'data-testid': 'result-count' },
            textContent: '2 results',
          },
          pageMetadata: { url, title: 'Shop' },
        }),
      { id: sessionId, url: page.url() },
    )
    await panel.evaluate(
      async (id) => chrome.runtime.sendMessage({ type: 'SESSION_STOP', sessionId: id }),
      sessionId,
    )

    await expect
      .poll(
        async () =>
          actionsOf(await exportSession(worker)).filter((a) => a.type === 'assert').length,
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(1)
    const exported = await exportSession(worker)
    await context.close()

    // --- generate: JSON -> `recospec add` into a fresh Playwright project ---
    projectDir = createPlaywrightProject()
    if (process.env.RECOSPEC_KEEP_PROJECT) console.log(`generated project: ${projectDir}`)
    const jsonPath = join(projectDir, 'recording.json')
    writeFileSync(jsonPath, JSON.stringify(exported))
    const added = await recospecAdd(jsonPath, projectDir)
    expect(added.status, added.output).toBe(0)

    const files = listFiles(projectDir)
    expect(files.filter((f) => f.endsWith('.spec.ts')).length, files.join('\n')).toBeGreaterThan(0)
    const code = files
      .filter((f) => f.endsWith('.ts') && f !== 'playwright.config.ts')
      .map((f) => readFileSync(join(projectDir ?? '', f), 'utf8'))
      .join('\n')
    // The recorded origin is not baked in: the test navigates by path and the config supplies BASE_URL.
    expect(code).not.toContain('127.0.0.1')
    expect(code).toMatch(/toHaveText|toContainText/)

    // --- run: the untouched generated project, pointed at the fixture server ---
    const cli = join(projectDir, 'node_modules/@playwright/test/cli.js')
    const result = await run(process.execPath, [cli, 'test'], projectDir, {
      BASE_URL: server.baseUrl,
    })
    expect(result.status, result.output).toBe(0)
    expect(result.output).toMatch(/\d+ passed/)
  })
})
