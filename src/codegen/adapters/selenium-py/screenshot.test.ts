import { describe, it, expect } from 'vitest'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { renderScaffold } from './scaffold'
import { validatePythonSource } from './python-validate'
import type { IRElement, IRPage, IRScenario, IRStep } from '../../ir/types'

const hero: IRElement = {
  name: 'heroBanner',
  locatorStrategy: 'testid',
  locatorValue: '[data-testid="hero"]',
  tagName: 'div',
}

const shot = (name: string, threshold?: number): IRStep => ({
  id: 'shot',
  action: 'assert',
  assertionDetail: { type: 'screenshot', name, threshold },
})

function page(steps: IRStep[]): IRPage {
  return {
    name: 'Home',
    className: 'HomePage',
    normalizedUrl: '/',
    elements: [hero],
    steps,
  }
}

function expectValidPython(source: string): void {
  const result = validatePythonSource(source)
  expect(result.ok, result.error).toBe(true)
}

describe('selenium-py — screenshot assertions', () => {
  it('compares against a baseline instead of leaving a TODO stub', () => {
    const out = renderScenario({ name: 'Home', pages: [page([shot('home', 0.1)])] })
    expect(out).toContain("_assert_screenshot(driver, 'home', 0.1)")
    expect(out).toContain('def _assert_screenshot(driver, name, threshold):')
    expect(out).toContain('ImageChops.difference')
    expect(out).not.toContain('TODO')
    expectValidPython(out)
  })

  it('imports Pillow and the stdlib modules the helper needs', () => {
    const out = renderScenario({ name: 'Home', pages: [page([shot('home')])] })
    expect(out).toContain('import io\n')
    expect(out).toContain('import pathlib\n')
    expect(out).toContain('from PIL import Image, ImageChops\n')
  })

  it('falls back to a 2% allowance when no threshold was recorded', () => {
    const out = renderScenario({ name: 'Home', pages: [page([shot('home')])] })
    expect(out).toContain("_assert_screenshot(driver, 'home', 0.02)")
  })

  it('sanitises the screenshot name', () => {
    const out = renderScenario({ name: 'Home', pages: [page([shot('my page/1')])] })
    expect(out).toContain("'my_page_1'")
  })

  it('renders the same assertion in a page object', () => {
    const out = renderPageObject(page([shot('home', 0.05)]))
    expect(out).toContain("_assert_screenshot(self.driver, 'home', 0.05)")
    expect(out).toContain('def _assert_screenshot(driver, name, threshold):')
    expectValidPython(out)
  })

  it('adds no helper or imports when there is no screenshot assertion', () => {
    const scenario: IRScenario = {
      name: 'Home',
      pages: [page([{ id: 'c', action: 'click', element: hero }])],
    }
    const out = renderScenario(scenario)
    expect(out).not.toContain('_assert_screenshot')
    expect(out).not.toContain('PIL')
  })

  it('lists Pillow in requirements.txt', () => {
    const req = renderScaffold().find((f) => f.filename === 'requirements.txt')!
    expect(req.content).toMatch(/^Pillow/m)
  })
})
