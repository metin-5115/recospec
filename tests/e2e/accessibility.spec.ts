import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loadExtension, getServiceWorker } from './helpers/extension'

/**
 * Axe smoke test for the side panel + bundled getting-started doc. We scope
 * the scan to "wcag2a", "wcag2aa", and "wcag21aa" rule sets and fail on any
 * `serious` / `critical` impact — the W6 DoD is "0 critical/serious".
 */
const IMPACT_LEVELS = ['serious', 'critical'] as const

test.describe('Accessibility smoke', () => {
  test('side panel has no serious/critical axe violations', async () => {
    const context = await loadExtension()
    // SW has to spin up before the extension ID is queryable.
    const worker = await getServiceWorker(context)
    const extensionId = worker.url().split('/')[2]
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/src/side-panel/side-panel.html`)
    // Wait for the first-run empty state to render — proves React hydrated.
    await page.waitForSelector('text=Recospec', { timeout: 10_000 })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    const fatal = results.violations.filter(
      (v) => v.impact && (IMPACT_LEVELS as readonly string[]).includes(v.impact),
    )
    if (fatal.length > 0) {
      // Surface each violation so the CI log spells out what to fix.
      console.error(
        'Accessibility violations:',
        JSON.stringify(
          fatal.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })),
          null,
          2,
        ),
      )
    }
    expect(fatal).toEqual([])
    await context.close()
  })

  test('getting-started doc has no serious/critical axe violations', async () => {
    const context = await loadExtension()
    const worker = await getServiceWorker(context)
    const extensionId = worker.url().split('/')[2]
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/docs/getting-started.html`)
    await page.waitForSelector('h1', { timeout: 10_000 })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    const fatal = results.violations.filter(
      (v) => v.impact && (IMPACT_LEVELS as readonly string[]).includes(v.impact),
    )
    if (fatal.length > 0) {
      console.error('Doc accessibility violations:', JSON.stringify(fatal, null, 2))
    }
    expect(fatal).toEqual([])
    await context.close()
  })
})
