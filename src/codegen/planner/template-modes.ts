import type { IRStep, IRElement, TemplateParamMode } from '../ir/types'

/**
 * Apply user-chosen rendering modes to template elements, keyed by the
 * element's `locatorValue` (the same key the normalizer dedupes elements by).
 *
 * MUST run on the flat steps BEFORE page grouping — method inference reads
 * `templateParamMode` to decide whether a templated click becomes a
 * parameterized `select*` method.
 */
export function applyTemplateModes(
  steps: IRStep[],
  modes: Record<string, TemplateParamMode> | undefined,
): void {
  if (!modes) return
  for (const step of steps) {
    const el = step.element
    if (!el?.template) continue
    const mode = modes[el.locatorValue]
    if (mode) el.templateParamMode = mode
  }
}

/** A template occurrence surfaced to hosts (VS Code QuickPick, side panel). */
export interface TemplateOccurrence {
  /** Mode-map key — the element's `locatorValue`. */
  key: string
  elementName: string
  kind: 'date' | 'param'
  capturedValue: string
  /** date-fns pattern when `kind === 'date'`. */
  pattern?: string
  localeId?: string
}

/** Collect the unique template elements in a normalized step list. */
export function collectTemplateOccurrences(steps: IRStep[]): TemplateOccurrence[] {
  const seen = new Map<string, TemplateOccurrence>()
  for (const step of steps) {
    const el = step.element
    if (!el?.template || seen.has(el.locatorValue)) continue
    seen.set(el.locatorValue, {
      key: el.locatorValue,
      elementName: el.name,
      kind: el.template.kind,
      capturedValue: el.template.capturedValue,
      pattern: el.template.pattern,
      localeId: el.template.localeId,
    })
  }
  return [...seen.values()]
}

export type ComposedParamMode = NonNullable<IRElement['composedParamMode']>

/**
 * Apply scoped/param rendering modes to container-anchored composed elements,
 * keyed by `locatorValue`. Runs BEFORE page grouping so method inference can
 * turn a `param`-mode click into a parameterized `select*` method.
 */
export function applyComposedModes(
  steps: IRStep[],
  modes: Record<string, ComposedParamMode> | undefined,
): void {
  if (!modes) return
  for (const step of steps) {
    const el = step.element
    if (el?.composed?.anchor.kind !== 'container') continue
    const mode = modes[el.locatorValue]
    if (mode) el.composedParamMode = mode
  }
}

/** A container-composed occurrence the host can offer to parameterize. */
export interface ComposedOccurrence {
  key: string
  elementName: string
  /** The stable label the row is currently scoped by (the parameter's default). */
  label: string
}

/** Container-composed elements whose anchor is disambiguated by a stable label. */
export function collectComposedOccurrences(steps: IRStep[]): ComposedOccurrence[] {
  const seen = new Map<string, ComposedOccurrence>()
  for (const step of steps) {
    const el = step.element
    const filterText = el?.composed?.anchor.filterText
    if (el?.composed?.anchor.kind !== 'container' || !filterText || seen.has(el.locatorValue)) {
      continue
    }
    seen.set(el.locatorValue, { key: el.locatorValue, elementName: el.name, label: filterText })
  }
  return [...seen.values()]
}
