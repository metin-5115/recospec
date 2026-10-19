import type { AssertionDetail } from '../../ir/types'
import { pyStr } from './locator'
import { urlAssertionPattern } from '../../shared/url-assertion'
import { DEFAULT_SCREENSHOT_THRESHOLD, screenshotName } from './screenshot'

/**
 * Where an assertion looks its element up. A page object addresses a stored
 * locator constant through `self.driver` / `self.wait`; a scenario inlines the
 * locator tuple and uses the module-level `driver` fixture.
 */
export interface PyAssertionTarget {
  /** Python expression for the WebDriver, e.g. `self.driver` or `driver`. */
  driver: string
  /** Python expression for a `WebDriverWait`, e.g. `self.wait`. */
  wait: string
  /** Python expression for the `(By, value)` tuple, or null when no element. */
  locator: string | null
}

/** Render one assertion as a Python statement shared by page objects and scenarios. */
export function renderPyAssertion(
  d: AssertionDetail,
  t: PyAssertionTarget,
  indent: string,
): string {
  const { driver, wait, locator } = t
  switch (d.type) {
    case 'visible':
      if (!locator) return `${indent}# assert visible (no element)`
      return `${indent}assert ${wait}.until(EC.visibility_of_element_located(${locator})) is not None`
    case 'hidden':
      if (!locator) return `${indent}# assert hidden (no element)`
      return `${indent}assert ${wait}.until(EC.invisibility_of_element_located(${locator}))`
    case 'text': {
      if (!locator) return `${indent}# assert text (no element)`
      const expected = pyStr(String(d.expected ?? ''))
      return `${indent}assert ${driver}.find_element(*${locator}).text == ${expected}`
    }
    case 'text-contains': {
      if (!locator) return `${indent}# assert text contains (no element)`
      const expected = pyStr(String(d.expected ?? ''))
      return `${indent}assert ${expected} in ${driver}.find_element(*${locator}).text`
    }
    case 'not-empty': {
      if (!locator) return `${indent}# assert not empty (no element)`
      return `${indent}assert ${driver}.find_element(*${locator}).text.strip() != ""`
    }
    case 'matches': {
      if (!locator) return `${indent}# assert matches (no element)`
      const pattern = pyStr(String(d.expected ?? ''))
      return `${indent}assert re.search(${pattern}, ${driver}.find_element(*${locator}).text)`
    }
    case 'value': {
      if (!locator) return `${indent}# assert value (no element)`
      const expected = pyStr(String(d.expected ?? ''))
      return `${indent}assert ${driver}.find_element(*${locator}).get_attribute('value') == ${expected}`
    }
    case 'attribute': {
      if (!locator) return `${indent}# assert attribute (no element)`
      const attr = pyStr(d.attribute ?? '')
      const expected = pyStr(String(d.expected ?? ''))
      return `${indent}assert ${driver}.find_element(*${locator}).get_attribute(${attr}) == ${expected}`
    }
    case 'count': {
      if (!locator) return `${indent}# assert count (no element)`
      const expected = Number(d.expected ?? 0)
      return `${indent}assert len(${driver}.find_elements(*${locator})) == ${expected}`
    }
    case 'url': {
      const pattern = urlAssertionPattern(String(d.expected ?? ''))
      const condition =
        pattern.kind === 'contains'
          ? `EC.url_contains(${pyStr(pattern.value)})`
          : `EC.url_matches(${pyStr(pattern.source)})`
      return `${indent}${wait}.until(${condition})`
    }
    case 'screenshot': {
      const name = pyStr(screenshotName(d.name))
      return `${indent}_assert_screenshot(${driver}, ${name}, ${d.threshold ?? DEFAULT_SCREENSHOT_THRESHOLD})`
    }
  }
}
