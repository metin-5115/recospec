import type { IRStep } from '../../ir/types'
import { isMultiUpload, uploadFixturePaths } from '../../shared/upload-fixtures'

const INTERACTION_ACTIONS: ReadonlySet<IRStep['action']> = new Set([
  'select',
  'check',
  'uncheck',
  'upload',
  'hover',
  'dblclick',
])

/**
 * Renders the element-targeted interactions Cypress has a one-liner for (`upload` is `selectFile`).
 * `chain` is the already-rendered element chain (`cy.findByRole(...)`).
 * Returns `null` for actions this helper doesn't own.
 *
 * Cypress has no native hover, so it is expressed as a `mouseover` trigger.
 */
export function renderInteraction(
  step: IRStep,
  chain: string,
  indent: string,
  selectArg?: string,
): string | null {
  if (!INTERACTION_ACTIONS.has(step.action)) return null
  switch (step.action) {
    case 'select':
      return `${indent}${chain}.select(${selectArg ?? JSON.stringify(step.value ?? '')});`
    case 'check':
      return `${indent}${chain}.check();`
    case 'uncheck':
      return `${indent}${chain}.uncheck();`
    case 'upload': {
      const paths = uploadFixturePaths(step).map((p) => JSON.stringify(p))
      if (paths.length === 0) return null
      const arg = isMultiUpload(step) ? `[${paths.join(', ')}]` : paths[0]
      return `${indent}${chain}.selectFile(${arg});`
    }
    case 'hover':
      return `${indent}${chain}.trigger('mouseover');`
    case 'dblclick':
      return `${indent}${chain}.dblclick();`
    default:
      return null
  }
}

/** `if (flag) { …check } else { …uncheck }` for a boolean-parameterised toggle. */
export function renderToggleByParam(chain: string, param: string, indent: string): string {
  return [
    `${indent}if (${param}) {`,
    `${indent}  ${chain}.check();`,
    `${indent}} else {`,
    `${indent}  ${chain}.uncheck();`,
    `${indent}}`,
  ].join('\n')
}
