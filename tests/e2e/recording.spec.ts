import { test, expect } from '@playwright/test'
import { loadExtension } from './helpers/extension'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

test.describe('Recording flow', () => {
  test('loads extension and can navigate fixture page', async () => {
    const context = await loadExtension()
    const page = await context.newPage()

    const fixturePath = `file://${resolve(__dirname, '../../fixtures/simple-form.html')}`
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
})
