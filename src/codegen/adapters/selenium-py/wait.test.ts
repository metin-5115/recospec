import { describe, it, expect } from 'vitest'
import { renderScenario } from './scenario'
import type { IRElement, IRPage, IRScenario, IRStep } from '../../ir/types'

const spinnerEl: IRElement = {
  name: 'loadingSpinner',
  locatorStrategy: 'css',
  locatorValue: '.spinner',
  tagName: 'div',
}

function pageWith(steps: IRStep[], elements: IRElement[] = []): IRPage {
  return {
    name: 'Home',
    className: 'HomePage',
    normalizedUrl: '/',
    elements,
    steps,
  }
}

describe('selenium-py wait rendering', () => {
  it('emits a comment + presence wait for networkidle (no native equivalent)', () => {
    const scenario: IRScenario = {
      name: 'flow',
      pages: [
        pageWith([
          { id: 'n1', action: 'navigate', url: '/' },
          { id: 'w1', action: 'wait', wait: { reason: 'networkidle', timeoutMs: 8000 } },
        ]),
      ],
    }
    const out = renderScenario(scenario)
    expect(out).toContain('# networkidle has no direct Selenium equivalent')
    expect(out).toContain(`EC.presence_of_element_located((By.TAG_NAME, 'body'))`)
  })

  it('emits invisibility_of_element_located for spinner waits', () => {
    const scenario: IRScenario = {
      name: 'flow',
      pages: [
        pageWith(
          [
            { id: 'n1', action: 'navigate', url: '/' },
            {
              id: 'w1',
              action: 'wait',
              element: spinnerEl,
              wait: { reason: 'spinner', timeoutMs: 7000 },
            },
          ],
          [spinnerEl],
        ),
      ],
    }
    const out = renderScenario(scenario)
    expect(out).toContain('EC.invisibility_of_element_located')
    expect(out).toContain('WebDriverWait(driver, 7).until')
  })

  it('matches snapshot for combined wait reasons', () => {
    const scenario: IRScenario = {
      name: 'wait flow',
      pages: [
        pageWith(
          [
            { id: 'n1', action: 'navigate', url: '/' },
            { id: 'w1', action: 'wait', wait: { reason: 'networkidle', timeoutMs: 8000 } },
            {
              id: 'w2',
              action: 'wait',
              element: spinnerEl,
              wait: { reason: 'spinner', timeoutMs: 6000 },
            },
          ],
          [spinnerEl],
        ),
      ],
    }
    expect(renderScenario(scenario)).toMatchSnapshot()
  })
})
