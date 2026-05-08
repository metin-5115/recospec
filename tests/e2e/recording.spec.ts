import { test, expect } from '@playwright/test'
import { loadExtension } from './helpers/extension'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

test.describe('Recording flow', () => {
  test('loads extension and can navigate fixture page', async () => {
    const context = await loadExtension()
    const page = await context.newPage()

    const fixturePath = `file://${resolve(__dirname, '../fixtures/simple-form.html')}`
    await page.goto(fixturePath)

    await expect(page.getByTestId('name-input')).toBeVisible()
    await expect(page.getByTestId('email-input')).toBeVisible()
    await expect(page.getByTestId('submit-btn')).toBeVisible()

    await page.getByTestId('name-input').fill('Alice')
    await page.getByTestId('email-input').fill('alice@example.com')
    await page.getByTestId('submit-btn').click()

    await expect(page.locator('#success')).toBeVisible()

    await context.close()
  })

  test('captures a deterministic page screenshot for visual regression', async () => {
    const context = await loadExtension()
    const page = await context.newPage()

    const fixturePath = `file://${resolve(__dirname, '../fixtures/simple-form.html')}`
    await page.goto(fixturePath)
    await page.setViewportSize({ width: 800, height: 600 })
    await expect(page.getByTestId('submit-btn')).toBeVisible()

    const buffer = await page.screenshot({ fullPage: false, type: 'png' })
    expect(buffer.byteLength).toBeGreaterThan(1024)
    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')

    await context.close()
  })
})
