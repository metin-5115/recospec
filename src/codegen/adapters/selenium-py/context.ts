import type { IRStep } from '../../ir/types'
import { indentLines } from '../../shared/indent'
import { pyStr, renderByTuple } from './locator'

/**
 * Selenium has no locator syntax for "inside this iframe / shadow root": the
 * driver has to be switched there first. This module renders that switching
 * around a step, leaving the step's own element-access code untouched.
 *
 *  - iframe: `switch_to.frame()` for each frame of the chain before the step,
 *    and `switch_to.default_content()` before the next step that is outside it.
 *  - open shadow root: for the step, `driver` (and the page object's `wait`) is
 *    rebound to the innermost `ShadowRoot`, which exposes the same
 *    `find_element` that `WebDriverWait` / `expected_conditions` call.
 */

/** `page` = a page-object method (`self.driver`); `test` = a test function (`driver`). */
export type PyContextTarget = 'page' | 'test'

export interface PyContextState {
  inFrame: boolean
}

export function newContextState(): PyContextState {
  return { inFrame: false }
}

function framesOf(step: IRStep): string[] {
  return step.element?.frameContext?.frameChain ?? []
}

function hostsOf(step: IRStep): string[] {
  return step.element?.shadowContext?.hostChain ?? []
}

const WAIT_TIMEOUT_SEC = 10

/** Wrap an already-rendered step with the frame / shadow switching it needs. */
export function wrapStepContext(
  step: IRStep,
  rendered: string | null,
  indent: string,
  state: PyContextState,
  target: PyContextTarget,
): string {
  if (!rendered) return ''
  const driver = target === 'page' ? 'self.driver' : 'driver'
  const frames = framesOf(step)
  const hosts = hostsOf(step)
  const out: string[] = []

  if (frames.length > 0) {
    const args = frames.map(pyStr).join(', ')
    out.push(
      target === 'page'
        ? `${indent}self._enter_frames(${args})`
        : `${indent}_enter_frames(driver, ${args})`,
    )
    state.inFrame = true
  } else if (state.inFrame) {
    out.push(`${indent}${driver}.switch_to.default_content()`)
    state.inFrame = false
  }

  if (hosts.length === 0) {
    out.push(rendered)
    return out.join('\n')
  }

  const args = hosts.map(pyStr).join(', ')
  if (step.element && renderByTuple(step.element).by === 'XPATH') {
    out.push(`${indent}# WARNING: XPath cannot pierce a shadow root — use a CSS locator`)
  }
  if (target === 'page') {
    out.push(
      `${indent}_outer_driver, _outer_wait = self.driver, self.wait`,
      `${indent}self.driver = self._shadow_root(${args})`,
      `${indent}self.wait = WebDriverWait(self.driver, ${WAIT_TIMEOUT_SEC})`,
      `${indent}try:`,
      indentLines(rendered, '    '),
      `${indent}finally:`,
      `${indent}    self.driver, self.wait = _outer_driver, _outer_wait`,
    )
  } else {
    out.push(
      `${indent}_outer_driver = driver`,
      `${indent}driver = _shadow_root(driver, ${args})`,
      rendered,
      `${indent}driver = _outer_driver`,
    )
  }
  return out.join('\n')
}

function usesFrames(steps: readonly IRStep[]): boolean {
  return steps.some((s) => framesOf(s).length > 0)
}

function usesShadow(steps: readonly IRStep[]): boolean {
  return steps.some((s) => hostsOf(s).length > 0)
}

/** Helper methods for the page-object class body (4-space indented), or ''. */
export function renderPageContextHelpers(steps: readonly IRStep[]): string {
  const blocks: string[] = []
  if (usesFrames(steps)) {
    blocks.push(
      [
        '    def _enter_frames(self, *selectors):',
        '        self.driver.switch_to.default_content()',
        '        for selector in selectors:',
        '            frame = self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, selector)))',
        '            self.driver.switch_to.frame(frame)',
      ].join('\n'),
    )
  }
  if (usesShadow(steps)) {
    blocks.push(
      [
        '    def _shadow_root(self, *hosts):',
        '        root = self.driver',
        '        for host in hosts:',
        '            root = root.find_element(By.CSS_SELECTOR, host).shadow_root',
        '        return root',
      ].join('\n'),
    )
  }
  return blocks.length ? '\n\n' + blocks.join('\n\n') : ''
}

/** Module-level helper functions for a test file, or ''. */
export function renderTestContextHelpers(steps: readonly IRStep[]): string {
  const blocks: string[] = []
  if (usesFrames(steps)) {
    blocks.push(
      [
        'def _enter_frames(driver, *selectors):',
        '    driver.switch_to.default_content()',
        '    for selector in selectors:',
        `        frame = WebDriverWait(driver, ${WAIT_TIMEOUT_SEC}).until(EC.presence_of_element_located((By.CSS_SELECTOR, selector)))`,
        '        driver.switch_to.frame(frame)',
      ].join('\n'),
    )
  }
  if (usesShadow(steps)) {
    blocks.push(
      [
        'def _shadow_root(driver, *hosts):',
        '    root = driver',
        '    for host in hosts:',
        '        root = root.find_element(By.CSS_SELECTOR, host).shadow_root',
        '    return root',
      ].join('\n'),
    )
  }
  return blocks.join('\n\n\n')
}
