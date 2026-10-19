import { describe, it, expect } from 'vitest'
import '../adapters/playwright-ts'
import '../adapters/cypress'
import '../adapters/selenium-py'
import '../adapters/selenium-java'
import { getAdapter, type RenderOptions } from '../adapters/registry'
import { groupIntoPages } from '../planner/page-grouper'
import { recordedOrigin } from '../shared/scenario-flow'
import { validatePythonSources } from '../adapters/selenium-py/python-validate'
import type { FrameworkId } from '@shared/types/generated'
import type { IRElement, IRScenario, IRStep } from '../ir/types'

const ORIGIN = 'https://shop.example.com'

const emailEl: IRElement = {
  name: 'emailInput',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="email"]',
  tagName: 'input',
}
const loginBtn: IRElement = {
  name: 'loginBtn',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="login"]',
  tagName: 'button',
}

const steps: IRStep[] = [
  { id: '1', action: 'navigate', url: '/login' },
  { id: '2', action: 'fill', element: emailEl, value: 'a@b.co' },
  { id: '3', action: 'click', element: loginBtn },
  { id: '4', action: 'navigate', url: '/cart' },
]

function scenarioFor(startUrl: string, flowSteps: IRStep[] = steps): IRScenario {
  return { name: 'Shop flow', startUrl, pages: groupIntoPages(flowSteps, startUrl) }
}

function render(framework: FrameworkId, scenario: IRScenario) {
  const adapter = getAdapter(framework)
  const options: RenderOptions = { baseUrl: recordedOrigin(scenario) }
  return {
    pages: scenario.pages.map((p) => adapter.renderPageObject(p, options).content),
    spec: adapter.renderScenario(scenario, options).content,
    scaffold: adapter.renderScaffold(options),
    bddScaffold: adapter.renderBddScaffold?.(options) ?? [],
  }
}

const scenario = scenarioFor(`${ORIGIN}/login`)
const everything = (framework: FrameworkId) => {
  const r = render(framework, scenario)
  return [r.spec, ...r.pages].join('\n')
}

describe('generated projects have one base URL', () => {
  describe('Playwright', () => {
    it('defaults the config to the recorded origin and lets BASE_URL override it', () => {
      const { scaffold, bddScaffold } = render('playwright-ts', scenario)
      for (const files of [scaffold, bddScaffold]) {
        const config = files.find((f) => f.filename === 'playwright.config.ts')
        if (!config) continue
        expect(config.content).toContain(`baseURL: process.env.BASE_URL ?? '${ORIGIN}'`)
      }
      expect(bddScaffold.some((f) => f.filename === 'playwright.config.ts')).toBe(true)
    })

    it('keeps the spec and the page objects relative', () => {
      const r = render('playwright-ts', scenario)
      expect(r.spec).toContain('await page.goto("/login");')
      expect(everything('playwright-ts')).not.toContain(ORIGIN)
      expect(r.pages[0]).toContain('await this.page.goto("/login");')
    })
  })

  describe('Cypress', () => {
    it('defaults baseUrl to the recorded origin and lets BASE_URL override it', () => {
      const { scaffold, bddScaffold } = render('cypress', scenario)
      for (const files of [scaffold, bddScaffold]) {
        const config = files.find((f) => f.filename === 'cypress.config.js')
        expect(config?.content).toContain(`baseUrl: process.env.BASE_URL ?? '${ORIGIN}'`)
      }
    })

    it('keeps the spec and the page objects relative', () => {
      const r = render('cypress', scenario)
      expect(r.spec).toContain('cy.visit("/login");')
      expect(everything('cypress')).not.toContain(ORIGIN)
      expect(r.pages[0]).toContain('cy.visit("/login");')
    })
  })

  describe('Selenium Python', () => {
    it('reads BASE_URL in conftest and hands it to the driver', () => {
      const conftest = render('selenium-py', scenario).scaffold.find(
        (f) => f.filename === 'conftest.py',
      )
      expect(conftest?.content).toContain(`BASE_URL = os.environ.get('BASE_URL', '${ORIGIN}')`)
      expect(conftest?.content).toContain('drv.base_url = BASE_URL')
      expect(conftest?.content).toMatch(/^import os$/m)
    })

    it('opens routes under the driver base URL, keeping the origin only as a fallback', () => {
      const r = render('selenium-py', scenario)
      expect(r.spec).toContain(`driver.get(getattr(driver, 'base_url', '${ORIGIN}') + '/login')`)
      expect(r.pages[0]).toContain(
        `self.driver.get(getattr(self.driver, 'base_url', '${ORIGIN}') + '/login')`,
      )
    })

    it('still produces valid Python', () => {
      const r = render('selenium-py', scenario)
      const conftest = r.scaffold.find((f) => f.filename === 'conftest.py')?.content ?? ''
      const sources = [r.spec, ...r.pages, conftest]
      for (const result of validatePythonSources(sources)) {
        expect(result.ok, result.error).toBe(true)
      }
    })
  })

  describe('Selenium Java', () => {
    it('resolves routes against the BASE_URL environment variable', () => {
      const r = render('selenium-java', scenario)
      const expr = `System.getenv().getOrDefault("BASE_URL", "${ORIGIN}") + "/login"`
      expect(r.spec).toContain(`driver.get(${expr});`)
      expect(r.pages[0]).toContain(`driver.get(${expr});`)
    })
  })

  // Java has no config file: its BASE_URL default lives in the generated code itself.
  it.each(['playwright-ts', 'cypress', 'selenium-py'] as const)(
    '%s falls back to localhost:3000 when nothing was recorded',
    (framework) => {
      const files = getAdapter(framework).renderScaffold({})
      const config = files.find((f) => /config\.(ts|js)$|conftest\.py$/.test(f.filename))
      expect(config?.content ?? '').toContain('http://localhost:3000')
    },
  )
})

describe('a recording that crosses origins', () => {
  const crossing: IRStep[] = [
    { id: '1', action: 'navigate', url: '/login' },
    { id: '2', action: 'click', element: loginBtn },
    { id: '3', action: 'navigate', url: 'https://pay.example.com/checkout' },
  ]
  const multi = scenarioFor(`${ORIGIN}/login`, crossing)

  it('keeps the foreign URL absolute and the home origin relative', () => {
    const out = render('playwright-ts', multi)
    expect(out.spec).toContain('"/login"')
    expect(out.spec + out.pages.join('\n')).toContain('https://pay.example.com/checkout')
    expect(out.spec + out.pages.join('\n')).not.toContain(ORIGIN)
  })
})

describe('a recording without an http origin', () => {
  it('keeps the file URL absolute', () => {
    const local = scenarioFor('file:///tmp/app/index.html', [
      { id: '1', action: 'click', element: loginBtn },
    ])
    expect(render('playwright-ts', local).spec).toContain('file:///tmp/app/index.html')
  })
})
