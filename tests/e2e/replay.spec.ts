import { test, expect } from '@playwright/test'
import { loadExtension, getServiceWorker } from './helpers/extension'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

interface SeedInputs {
  sessionId: string
  fixtureUrl: string
}

/**
 * Build the seed payload (session + 3 actions: fill, fill, click) that the
 * E2E test drops into the extension's Dexie DB via the SW global. Each
 * action carries the locator the replay controller will resolve on the live
 * page — `data-testid` for the inputs and the submit button.
 */
function buildFixtureRecording(input: SeedInputs) {
  const now = Date.now()
  const session = {
    sessionId: input.sessionId,
    name: 'Replay E2E',
    state: 'stopped',
    startUrl: input.fixtureUrl,
    startedAt: now,
    stoppedAt: now + 10,
    iterationNumber: 1,
    flowSignature: `e2e::${input.fixtureUrl}`,
    metadata: {
      userAgent: 'playwright-e2e',
      viewport: { width: 1280, height: 720 },
      timezone: 'UTC',
    },
    config: { captureClicks: true, captureInputs: true, captureNavigation: true },
  }

  const baseLocator = (selector: string) => ({
    strategy: 'testid' as const,
    selector,
    framework: {},
    score: 95,
    matchCount: 1,
  })

  const actions = [
    {
      actionId: 'replay-a1',
      sessionId: input.sessionId,
      sequenceNumber: 0,
      type: 'fill' as const,
      timestamp: now + 1,
      pageUrl: input.fixtureUrl,
      target: {
        primaryLocator: baseLocator('name-input'),
        fallbackLocators: [
          {
            strategy: 'css' as const,
            selector: '#name',
            framework: {},
            score: 70,
            matchCount: 1,
          },
        ],
        elementSnapshot: {
          tagName: 'input',
          attributes: { id: 'name', 'data-testid': 'name-input', type: 'text' },
          textContent: '',
        },
      },
      payload: { value: 'Alice' },
    },
    {
      actionId: 'replay-a2',
      sessionId: input.sessionId,
      sequenceNumber: 1,
      type: 'fill' as const,
      timestamp: now + 2,
      pageUrl: input.fixtureUrl,
      target: {
        primaryLocator: baseLocator('email-input'),
        fallbackLocators: [
          {
            strategy: 'css' as const,
            selector: '#email',
            framework: {},
            score: 70,
            matchCount: 1,
          },
        ],
        elementSnapshot: {
          tagName: 'input',
          attributes: { id: 'email', 'data-testid': 'email-input', type: 'email' },
          textContent: '',
        },
      },
      payload: { value: 'alice@example.com' },
    },
    {
      actionId: 'replay-a3',
      sessionId: input.sessionId,
      sequenceNumber: 2,
      type: 'click' as const,
      timestamp: now + 3,
      pageUrl: input.fixtureUrl,
      target: {
        primaryLocator: baseLocator('submit-btn'),
        fallbackLocators: [
          {
            strategy: 'css' as const,
            selector: 'button[type="submit"]',
            framework: {},
            score: 70,
            matchCount: 1,
          },
        ],
        elementSnapshot: {
          tagName: 'button',
          attributes: { 'data-testid': 'submit-btn', type: 'submit' },
          textContent: 'Send',
        },
      },
    },
  ]

  return { session, actions }
}

test.describe('Replay flow', () => {
  test('replays a 3-step session (fill, fill, click) and surfaces success', async () => {
    const context = await loadExtension()
    const worker = await getServiceWorker(context)
    const page = await context.newPage()

    const fixturePath = `file://${resolve(__dirname, '../fixtures/simple-form.html').replace(/\\/g, '/')}`
    await page.goto(fixturePath)

    // Wait for the recorder content script to register message listeners.
    await expect(page.getByTestId('submit-btn')).toBeVisible()

    const sessionId = `e2e-replay-${Date.now()}`
    const recording = buildFixtureRecording({ sessionId, fixtureUrl: fixturePath })

    // Seed Dexie via the SW global. `__recospecSeed` is exposed by
    // background/index.ts specifically for this kind of out-of-band write.
    await worker.evaluate(async (seed) => {
      const fn = (globalThis as { __recospecSeed?: (s: unknown, a: unknown) => Promise<void> })
        .__recospecSeed
      if (!fn) throw new Error('__recospecSeed not registered on SW global')
      await fn(seed.session, seed.actions)
    }, recording)

    // Drive the replay loop directly. broadcastToUI calls won't have a
    // listener (side panel is closed), so we wait for the controller's
    // promise to resolve and then assert on the page state.
    await worker.evaluate(async (id) => {
      const fn = (globalThis as { __recospecReplay?: (s: string) => Promise<void> })
        .__recospecReplay
      if (!fn) throw new Error('__recospecReplay not registered on SW global')
      await fn(id)
    }, sessionId)

    // Each replay step dispatches DOM events; assert on the observable
    // outcome rather than the controller's internal counters.
    await expect(page.getByTestId('name-input')).toHaveValue('Alice')
    await expect(page.getByTestId('email-input')).toHaveValue('alice@example.com')
    // The submit-btn click triggers the success banner via the fixture's
    // own JS — proof that the click landed and propagated.
    await expect(page.locator('#success')).toBeVisible()

    await context.close()
  })
})
