import type { AssertionDetail } from '../../ir/types'
import { urlAssertionRegexSource } from '../../shared/url-assertion'

/** Render one Playwright `expect` assertion against a locator / page expression. */
export function renderAssertionMatcher(
  d: AssertionDetail,
  locator: string,
  indent: string,
): string {
  switch (d.type) {
    case 'visible':
      return `${indent}await expect(${locator}).toBeVisible();`
    case 'hidden':
      return `${indent}await expect(${locator}).toBeHidden();`
    case 'text':
      return `${indent}await expect(${locator}).toHaveText(${JSON.stringify(d.expected ?? '')});`
    case 'text-contains':
      return `${indent}await expect(${locator}).toContainText(${JSON.stringify(d.expected ?? '')});`
    case 'not-empty':
      return `${indent}await expect(${locator}).not.toBeEmpty();`
    case 'matches':
      return `${indent}await expect(${locator}).toHaveText(new RegExp(${JSON.stringify(String(d.expected ?? ''))}));`
    case 'value':
      return `${indent}await expect(${locator}).toHaveValue(${JSON.stringify(d.expected ?? '')});`
    case 'attribute':
      return `${indent}await expect(${locator}).toHaveAttribute(${JSON.stringify(d.attribute ?? '')}, ${JSON.stringify(d.expected ?? '')});`
    case 'count':
      return `${indent}await expect(${locator}).toHaveCount(${Number(d.expected ?? 0)});`
    case 'url':
      return `${indent}await expect(${locator}).toHaveURL(new RegExp(${JSON.stringify(urlAssertionRegexSource(String(d.expected ?? '')))}));`
    case 'screenshot': {
      const file = `${d.name ?? 'snapshot'}.png`
      const threshold = d.threshold ?? 0.2
      return `${indent}await expect(${locator}).toHaveScreenshot(${JSON.stringify(file)}, { threshold: ${threshold} });`
    }
  }
}
