import { describe, it, expect } from 'vitest'
import { renderPageObject } from './page-object'
import { renderScenario } from './scenario'
import { validateJavaSource } from './java-validate'
import type { IRElement, IRPage, IRStep } from '../../ir/types'

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

function expectBalanced(source: string): void {
  const result = validateJavaSource(source)
  expect(result.ok, JSON.stringify(result.issues)).toBe(true)
}

describe('selenium-java — screenshot assertions', () => {
  it('compares against a baseline instead of leaving a TODO stub', () => {
    const out = renderScenario({ name: 'Home', pages: [page([shot('home', 0.1)])] })
    expect(out).toContain('assertScreenshot(driver, "home", 0.1);')
    expect(out).toContain(
      'private static void assertScreenshot(WebDriver driver, String name, double threshold)',
    )
    expect(out).toContain('javax.imageio.ImageIO')
    expect(out).not.toContain('TODO')
    expectBalanced(out)
  })

  it('needs no extra dependency: the helper only uses the JDK and Selenium', () => {
    const out = renderScenario({ name: 'Home', pages: [page([shot('home')])] })
    expect(out).not.toContain('ru.yandex')
    expect(out).toContain('import org.openqa.selenium.OutputType;')
    expect(out).toContain('import org.openqa.selenium.TakesScreenshot;')
  })

  it('falls back to a 2% allowance when no threshold was recorded', () => {
    const out = renderScenario({ name: 'Home', pages: [page([shot('home')])] })
    expect(out).toContain('assertScreenshot(driver, "home", 0.02);')
  })

  it('renders the same assertion in a page object', () => {
    const out = renderPageObject(page([shot('home', 0.05)]))
    expect(out).toContain('assertScreenshot(driver, "home", 0.05);')
    expect(out).toContain('private static void assertScreenshot(')
    expectBalanced(out)
  })

  it('adds no helper when there is no screenshot assertion', () => {
    const out = renderScenario({
      name: 'Home',
      pages: [page([{ id: 'c', action: 'click', element: hero }])],
    })
    expect(out).not.toContain('assertScreenshot')
    expect(out).not.toContain('TakesScreenshot')
  })
})
