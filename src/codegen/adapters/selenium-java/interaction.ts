import type { IRStep } from '../../ir/types'
import { javaStr } from './locator'

const SELECT_IMPORT = 'import org.openqa.selenium.support.ui.Select;'
const ACTIONS_IMPORT = 'import org.openqa.selenium.interactions.Actions;'

export interface JavaInteractionTarget {
  /** Statements that wait for / resolve the element before it is used. */
  prelude: string[]
  /** Java expression referring to the resolved WebElement after `prelude` ran. */
  ref: string
  /**
   * Wrap the statements in a `{ … }` block. Needed in test methods where the
   * prelude declares a local, so several interactions can reuse the same name.
   */
  scoped: boolean
}

export interface JavaInteractionOptions {
  /** Java expression for the option value instead of the recorded literal. */
  selectArg?: string
  /** Boolean parameter that decides the final checked state (check/uncheck). */
  toggleParam?: string
}

function wrap(lines: string[], indent: string, scoped: boolean): string {
  if (!scoped) return lines.map((l) => `${indent}${l}`).join('\n')
  const inner = lines.map((l) => `${indent}    ${l}`)
  return [`${indent}{`, ...inner, `${indent}}`].join('\n')
}

/**
 * Renders select / check / uncheck / hover / dblclick for Selenium Java.
 * Returns `null` for actions this helper doesn't own.
 */
export function renderJavaInteraction(
  step: IRStep,
  target: JavaInteractionTarget,
  indent: string,
  options: JavaInteractionOptions = {},
): string | null {
  const { prelude, ref, scoped } = target
  switch (step.action) {
    case 'select': {
      const arg = options.selectArg ?? javaStr(step.value ?? '')
      return wrap([...prelude, `new Select(${ref}).selectByValue(${arg});`], indent, scoped)
    }
    case 'check':
    case 'uncheck': {
      const condition = options.toggleParam
        ? `${ref}.isSelected() != ${options.toggleParam}`
        : step.action === 'check'
          ? `!${ref}.isSelected()`
          : `${ref}.isSelected()`
      return wrap([...prelude, `if (${condition}) {`, `    ${ref}.click();`, `}`], indent, scoped)
    }
    case 'hover':
      return wrap(
        [...prelude, `new Actions(driver).moveToElement(${ref}).perform();`],
        indent,
        scoped,
      )
    case 'dblclick':
      return wrap(
        [...prelude, `new Actions(driver).doubleClick(${ref}).perform();`],
        indent,
        scoped,
      )
    default:
      return null
  }
}

/** Extra import lines (each newline-terminated) the given steps require. */
export function javaInteractionImports(steps: IRStep[]): string {
  const needsSelect = steps.some((s) => s.action === 'select')
  const needsActions = steps.some((s) => s.action === 'hover' || s.action === 'dblclick')
  return [needsActions ? ACTIONS_IMPORT : '', needsSelect ? SELECT_IMPORT : '']
    .filter(Boolean)
    .map((line) => `${line}\n`)
    .join('')
}
