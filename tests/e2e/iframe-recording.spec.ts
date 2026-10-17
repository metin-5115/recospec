import { test, expect } from '@playwright/test'
import { loadExtension, getServiceWorker } from './helpers/extension'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

type ExportFn = () => Promise<{ payload?: unknown } | null>

interface ExportedAction {
  type: string
  target?: { frameContext?: { frameChain: string[] } }
}

test.describe('Recording inside an iframe', () => {
  test('captures typing and clicks in an iframe with its frame chain', async () => {
    const context = await loadExtension()
    const worker = await getServiceWorker(context)
    const extensionId = new URL(worker.url()).host

    const page = await context.newPage()
    const fixture = `file://${resolve(__dirname, '../fixtures/iframe-form.html').replace(/\\/g, '/')}`
    await page.goto(fixture)
    await page.bringToFront()

    // An extension page speaks the same message contract as the side panel.
    const panel = await context.newPage()
    await panel.goto(`chrome-extension://${extensionId}/src/side-panel/side-panel.html`)
    await page.bringToFront()

    const tabId = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'file:///*' })
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
    // Reload so the content script, frames included, attaches with recording already on.
    await page.reload()

    const frame = page.frameLocator('iframe[name="payment"]')
    await frame.getByLabel('Card name').click()
    await frame.getByLabel('Card name').pressSequentially('Ada Lovelace', { delay: 20 })
    await frame.getByTestId('pay').click()

    await expect
      .poll(
        async () => {
          const exported = await worker.evaluate(async () =>
            (globalThis as unknown as { __recospecExport: ExportFn }).__recospecExport(),
          )
          // `null` means nothing was recorded at all (the failure this test guards against).
          const payload = (exported && (exported.payload ?? exported)) as {
            actions: ExportedAction[]
          } | null
          return (payload?.actions ?? []).filter((a) => a.target?.frameContext).length
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(3)

    const exported = await worker.evaluate(async () =>
      (globalThis as unknown as { __recospecExport: ExportFn }).__recospecExport(),
    )
    const payload = (exported && (exported.payload ?? exported)) as { actions: ExportedAction[] }
    const inFrame = payload.actions.filter((a) => a.target?.frameContext)
    expect(inFrame.map((a) => a.type)).toEqual(['click', 'fill', 'click'])
    for (const action of inFrame) {
      expect(action.target?.frameContext?.frameChain).toEqual(['iframe[name="payment"]'])
    }

    await context.close()
  })
})
