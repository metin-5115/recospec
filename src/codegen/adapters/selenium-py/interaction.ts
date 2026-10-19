import type { IRStep } from '../../ir/types'
import { pyStr } from './locator'
import { uploadFixturePaths } from '../../shared/upload-fixtures'

const SELECT_IMPORT = 'from selenium.webdriver.support.ui import Select'
const ACTION_CHAINS_IMPORT = 'from selenium.webdriver.common.action_chains import ActionChains'

export interface PyInteractionOptions {
  /** Python expression used for the option value instead of the recorded literal. */
  selectArg?: string
  /** Boolean parameter that decides the final checked state (check/uncheck steps). */
  toggleParam?: string
}

/**
 * Renders select / check / uncheck / upload / hover / dblclick for Selenium Python.
 *
 * `elementExpr` is an expression that yields the WebElement (the caller owns the
 * explicit wait); `driverExpr` is `self.driver` in page objects and `driver` in
 * test functions. Returns `null` for actions this helper doesn't own.
 */
export function renderPyInteraction(
  step: IRStep,
  elementExpr: string,
  driverExpr: string,
  indent: string,
  options: PyInteractionOptions = {},
): string | null {
  switch (step.action) {
    case 'select': {
      const arg = options.selectArg ?? pyStr(step.value ?? '')
      return `${indent}Select(${elementExpr}).select_by_value(${arg})`
    }
    case 'check':
    case 'uncheck': {
      const condition = options.toggleParam
        ? `_el.is_selected() != ${options.toggleParam}`
        : step.action === 'check'
          ? 'not _el.is_selected()'
          : '_el.is_selected()'
      return [
        `${indent}_el = ${elementExpr}`,
        `${indent}if ${condition}:`,
        `${indent}    _el.click()`,
      ].join('\n')
    }
    case 'upload': {
      // A file input takes the absolute path as keystrokes; several files are newline-separated.
      const paths = uploadFixturePaths(step).map((p) => `os.path.abspath(${pyStr(p)})`)
      if (paths.length === 0) return null
      const arg = paths.length > 1 ? `'\\n'.join([${paths.join(', ')}])` : paths[0]
      return `${indent}${elementExpr}.send_keys(${arg})`
    }
    case 'hover':
      return [
        `${indent}_el = ${elementExpr}`,
        `${indent}ActionChains(${driverExpr}).move_to_element(_el).perform()`,
      ].join('\n')
    case 'dblclick':
      return [
        `${indent}_el = ${elementExpr}`,
        `${indent}ActionChains(${driverExpr}).double_click(_el).perform()`,
      ].join('\n')
    default:
      return null
  }
}

/** Extra import lines (each newline-terminated) the given steps require. */
export function pyInteractionImports(steps: IRStep[]): string {
  const needsSelect = steps.some((s) => s.action === 'select')
  const needsActions = steps.some((s) => s.action === 'hover' || s.action === 'dblclick')
  return [needsSelect ? SELECT_IMPORT : '', needsActions ? ACTION_CHAINS_IMPORT : '']
    .filter(Boolean)
    .map((line) => `${line}\n`)
    .join('')
}
