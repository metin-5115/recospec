import type { AssertionDetail } from '../ir/types'

/** Assertions about the page as a whole — they never address an element. */
/** True for a Gherkin step that came from the final-state "page URL contains …" assertion. */
export function isUrlAssertionStep(step: {
  sourceSteps: readonly { assertionDetail?: AssertionDetail }[]
}): boolean {
  return step.sourceSteps[0]?.assertionDetail?.type === 'url'
}

export function isPageLevelAssertion(d: AssertionDetail): boolean {
  return d.type === 'screenshot' || d.type === 'url'
}
