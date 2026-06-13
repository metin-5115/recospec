import { describe, it, expect } from 'vitest'
import type { IRPage, IRStep, IRElement } from '../ir/types'
import type { TemplateSpec } from '@shared/types/locator'
import { renderPageObject as renderPlaywrightPage } from './playwright-ts'
import { renderPageObject as renderCypressPage } from './cypress/page-object'
import { renderPageObject as renderSeleniumPyPage } from './selenium-py/page-object'
import { renderPageObject as renderSeleniumJavaPage } from './selenium-java/page-object'
import { inferMethods } from '../planner/method-inferer'

const DATE_TEMPLATE: TemplateSpec = {
  strategy: 'role-name',
  role: 'gridcell',
  nameTemplate: '{date:d MMMM yyyy EEEE:tr}',
  capturedValue: '12 Ağustos 2026 Çarşamba',
  capturedNormalized: '2026-08-12',
  kind: 'date',
  pattern: 'd MMMM yyyy EEEE',
  localeId: 'tr',
  scope: {
    kind: 'testid',
    value: 'calendar',
    css: '[data-testid="calendar"]',
    xpath: `//*[@data-testid='calendar']`,
  },
  xpath: `//*[@data-testid='calendar']//td[normalize-space()='12 Ağustos 2026 Çarşamba']`,
}

function dateCellElement(overrides: Partial<IRElement> = {}): IRElement {
  return {
    name: 'dateCell',
    locatorStrategy: 'template',
    locatorValue: 'testid=calendar >> gridcell[name={date:d MMMM yyyy EEEE:tr}]',
    tagName: 'td',
    template: DATE_TEMPLATE,
    templateRelativeDays: 64,
    ...overrides,
  }
}

function calendarPage(element: IRElement): IRPage {
  const steps: IRStep[] = [
    { id: 's1', action: 'navigate', url: 'https://example.com/booking' },
    { id: 's2', action: 'click', element },
  ]
  return {
    name: 'Booking',
    className: 'BookingPage',
    normalizedUrl: 'https://example.com/booking',
    steps,
    elements: [element],
    inferredMethods: inferMethods(steps),
  }
}

describe('template rendering — Playwright', () => {
  it('renders a parameterized Date accessor with NO hardcoded recorded value', () => {
    const code = renderPlaywrightPage(calendarPage(dateCellElement()))
    expect(code).toContain('dateCell(date: Date)')
    expect(code).toContain(`import { format } from 'date-fns';`)
    expect(code).toContain(`import { tr } from 'date-fns/locale';`)
    expect(code).toContain('format(date, "d MMMM yyyy EEEE", { locale: tr })')
    expect(code).toContain('.getByTestId("calendar").getByRole("gridcell", { name: name })')
    // The recorded sample never appears anywhere in the page object.
    expect(code).not.toContain('Ağustos')
  })

  it('renders the inferred method with a Date parameter calling the accessor', () => {
    const code = renderPlaywrightPage(calendarPage(dateCellElement()))
    expect(code).toContain('async selectDateCell(date: Date) {')
    expect(code).toContain('await this.dateCell(date).click();')
  })

  it('relative mode recomputes from the run day', () => {
    const code = renderPlaywrightPage(
      calendarPage(dateCellElement({ templateParamMode: 'relative' })),
    )
    expect(code).toContain('get dateCell()')
    expect(code).toContain(
      'format(addDays(startOfToday(), 64), "d MMMM yyyy EEEE", { locale: tr })',
    )
    expect(code).toContain(`import { addDays, format, startOfToday } from 'date-fns';`)
    expect(code).not.toContain('Ağustos')
  })

  it('fixed mode freezes the recorded value and needs no date-fns import', () => {
    const code = renderPlaywrightPage(calendarPage(dateCellElement({ templateParamMode: 'fixed' })))
    expect(code).toContain('get dateCell()')
    expect(code).toContain('"12 Ağustos 2026 Çarşamba"')
    expect(code).not.toContain(`from 'date-fns'`)
  })

  it('param-kind templates take the value as a string parameter', () => {
    const element = dateCellElement({
      name: 'itemByValue',
      template: {
        strategy: 'role-name',
        role: 'cell',
        nameTemplate: '{param:value}',
        capturedValue: 'Concorde Aria Hotel',
        kind: 'param',
        xpath: `//td[normalize-space()='Concorde Aria Hotel']`,
      },
      templateRelativeDays: undefined,
    })
    const code = renderPlaywrightPage(calendarPage(element))
    expect(code).toContain('itemByValue(value: string)')
    expect(code).toContain('.getByRole("cell", { name: value })')
    expect(code).toContain('await this.itemByValue(value).click();')
    expect(code).not.toContain('date-fns')
  })
})

describe('template rendering — Cypress', () => {
  it('renders a parameterized accessor with date-fns formatting', () => {
    const code = renderCypressPage(calendarPage(dateCellElement()))
    expect(code).toContain('dateCell(date) {')
    expect(code).toContain('format(date, "d MMMM yyyy EEEE", { locale: tr })')
    expect(code).toContain(`import { format } from 'date-fns';`)
    expect(code).toContain('cy.get("[data-testid=\\"calendar\\"]").contains("td", name)')
    expect(code).toContain('this.dateCell(date).click();')
    expect(code).not.toContain('Ağustos')
  })
})

describe('template rendering — Selenium Python', () => {
  it('renders a label-string accessor documenting pattern + locale', () => {
    const code = renderSeleniumPyPage(calendarPage(dateCellElement()))
    expect(code).toContain('def date_cell(self, date: str):')
    expect(code).toContain(`formatted as 'd MMMM yyyy EEEE' (locale tr)`)
    expect(code).toContain('self.date_cell(date).click()')
    // The class constant keeps the instantiated XPath as a non-param fallback.
    expect(code).toContain('DATE_CELL = (By.XPATH,')
  })
})

describe('template rendering — Selenium Java', () => {
  it('renders a label-string accessor and parameterized inferred method', () => {
    const code = renderSeleniumJavaPage(calendarPage(dateCellElement()))
    expect(code).toContain('public WebElement dateCell(String date) {')
    expect(code).toContain('formatted as "d MMMM yyyy EEEE" (locale tr)')
    expect(code).toContain(
      'wait.until(ExpectedConditions.elementToBeClickable(dateCell(date))).click();',
    )
    expect(code).toContain('public void selectDateCell(String date) {')
  })
})

describe('method inference for template clicks', () => {
  it('produces a select method with a date param', () => {
    const element = dateCellElement()
    const methods = inferMethods([{ id: 's2', action: 'click', element }])
    expect(methods).toHaveLength(1)
    expect(methods[0].name).toBe('selectDateCell')
    expect(methods[0].params).toEqual(['date'])
    expect(methods[0].paramTypes).toEqual(['date'])
  })

  it('does not parameterize fixed-mode templates', () => {
    const element = dateCellElement({ templateParamMode: 'fixed' })
    const methods = inferMethods([{ id: 's2', action: 'click', element }])
    expect(methods[0].params).toEqual([])
    expect(methods[0].name).toBe('clickDateCell')
  })
})
