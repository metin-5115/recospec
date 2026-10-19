import { describe, it, expect, vi } from 'vitest'
import {
  selfHealingLocator,
  PLAYWRIGHT_SELF_HEALING_TS,
  CYPRESS_SELF_HEALING_JS,
  type MinimalPlaywrightLocator,
  type MinimalPlaywrightPage,
} from './self-healing'

function fakePage(matches: Record<string, number>): MinimalPlaywrightPage {
  return {
    locator: vi.fn((sel: string): MinimalPlaywrightLocator => ({
      count: vi.fn().mockResolvedValue(matches[sel] ?? 0),
    })),
  }
}

describe('selfHealingLocator', () => {
  it('returns the primary locator when it matches', async () => {
    const page = fakePage({ '#primary': 1, '#fallback': 1 })
    const result = await selfHealingLocator(page, ['#primary', '#fallback'])
    expect(result).toBeDefined()
    expect(page.locator).toHaveBeenCalledTimes(1)
    expect(page.locator).toHaveBeenCalledWith('#primary')
  })

  it('falls through to the next selector when the primary has zero matches', async () => {
    const page = fakePage({ '#primary': 0, '#fallback1': 1 })
    const result = await selfHealingLocator(page, ['#primary', '#fallback1', '#fallback2'])
    expect(result).toBeDefined()
    expect(page.locator).toHaveBeenCalledTimes(2)
    expect(page.locator).toHaveBeenLastCalledWith('#fallback1')
  })

  it('walks the entire chain until it finds a match', async () => {
    const page = fakePage({ a: 0, b: 0, c: 0, d: 1 })
    const result = await selfHealingLocator(page, ['a', 'b', 'c', 'd'])
    expect(result).toBeDefined()
    expect(page.locator).toHaveBeenCalledTimes(4)
  })

  it('throws when every selector fails', async () => {
    const page = fakePage({ a: 0, b: 0 })
    await expect(selfHealingLocator(page, ['a', 'b'])).rejects.toThrow(/all 2 selectors failed/i)
  })

  it('throws on an empty selector list', async () => {
    const page = fakePage({})
    await expect(selfHealingLocator(page, [])).rejects.toThrow(/no selectors/i)
  })

  it('continues past selectors that throw and reports the error in the message', async () => {
    const page: MinimalPlaywrightPage = {
      locator: (sel: string) => {
        if (sel === 'broken') throw new Error('parse error')
        return { count: () => Promise.resolve(sel === 'good' ? 1 : 0) }
      },
    }
    const result = await selfHealingLocator(page, ['broken', 'good'])
    expect(result).toBeDefined()

    await expect(selfHealingLocator(page, ['broken', 'still-bad'])).rejects.toThrow(
      /broken \(parse error\)/,
    )
  })
})

describe('emitted scaffold sources', () => {
  it('Playwright TS source exports selfHealingLocator and references @playwright/test', () => {
    expect(PLAYWRIGHT_SELF_HEALING_TS).toContain('export async function selfHealingLocator')
    expect(PLAYWRIGHT_SELF_HEALING_TS).toContain("from '@playwright/test'")
  })

  it('Cypress source registers cy.selfHealing', () => {
    expect(CYPRESS_SELF_HEALING_JS).toContain("Cypress.Commands.add('selfHealing'")
  })
})
