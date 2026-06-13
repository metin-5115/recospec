import { describe, it, expect, beforeEach } from 'vitest'
import { LocatorEngine } from '../../index'
import type { RecordedAction } from '@shared/types/action'
import { normalizeActions } from '@codegen/normalizer/action-normalizer'
import { groupIntoPages } from '@codegen/planner/page-grouper'
import { renderPageObject as renderPlaywrightPage } from '@codegen/adapters/playwright-ts'

/**
 * End-to-end i18n guarantee: a datepicker click recorded in ANY supported
 * locale flows engine → IR → Playwright POM as a parameterized template —
 * the generated page object contains no hardcoded date string.
 */

const engine = new LocatorEngine()

interface CalendarCase {
  lang: string
  localeId: string
  labels: [string, string, string, string]
  /** Month word that must never leak into the POM. */
  monthWord: string
}

const CASES: CalendarCase[] = [
  {
    lang: 'tr',
    localeId: 'tr',
    labels: [
      '11 Ağustos 2026 Salı',
      '12 Ağustos 2026 Çarşamba',
      '13 Ağustos 2026 Perşembe',
      '14 Ağustos 2026 Cuma',
    ],
    monthWord: 'Ağustos',
  },
  {
    lang: 'en',
    localeId: 'en-US',
    labels: ['August 11, 2026', 'August 12, 2026', 'August 13, 2026', 'August 14, 2026'],
    monthWord: 'August',
  },
  {
    lang: 'de',
    localeId: 'de',
    labels: ['11. August 2026', '12. August 2026', '13. August 2026', '14. August 2026'],
    monthWord: 'August',
  },
]

function mountCalendar(c: CalendarCase): Element {
  document.documentElement.lang = c.lang
  document.body.innerHTML = `
    <div data-testid="calendar" role="grid">
      ${c.labels.map((l) => `<button type="button">${l}</button>`).join('\n')}
    </div>`
  return document.querySelectorAll('button')[1]!
}

function recordClick(target: Element): RecordedAction {
  const bundle = engine.evaluate(target, document)
  expect(bundle).not.toBeNull()
  return {
    actionId: 'a1',
    sessionId: 's1',
    sequenceNumber: 1,
    type: 'click',
    timestamp: Date.UTC(2026, 5, 9),
    pageUrl: 'https://example.com/booking',
    target: {
      primaryLocator: bundle!.primary,
      fallbackLocators: bundle!.fallbacks,
      elementSnapshot: {
        tagName: 'button',
        attributes: { type: 'button' },
        textContent: target.textContent ?? '',
      },
    },
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.documentElement.lang = ''
})

describe.each(CASES)('calendar i18n — $localeId', (c) => {
  it('engine yields a template primary with the right locale', () => {
    const target = mountCalendar(c)
    const bundle = engine.evaluate(target, document)
    expect(bundle!.primary.strategy).toBe('template')
    expect(bundle!.primary.template!.kind).toBe('date')
    expect(bundle!.primary.template!.localeId).toBe(c.localeId)
    expect(bundle!.primary.template!.capturedNormalized).toBe('2026-08-12')
    expect(String(bundle!.primary.selector)).not.toContain(c.monthWord)
  })

  it('generated Playwright POM has a parameterized accessor and NO hardcoded date', () => {
    const target = mountCalendar(c)
    const action = recordClick(target)
    const { flatSteps } = normalizeActions([action])
    const pages = groupIntoPages(flatSteps, 'https://example.com/booking')
    expect(pages).toHaveLength(1)

    const code = renderPlaywrightPage(pages[0]!)
    expect(code).toContain('(date: Date)')
    expect(code).toContain(`from 'date-fns'`)
    expect(code).not.toContain(c.monthWord)
    expect(code).not.toContain('2026')
  })
})
