import { getEnvVarName } from '../planner/sensitive-detector'
import type { InferredMethod, IRPage, IRParamType } from '../ir/types'
import { deriveFillVariants, fillEnvVarName, type FillVariant } from '../planner/fill-variants'

/** Minimum raw value length worth masking; shorter strings would mangle unrelated text. */
const MIN_REDACTABLE_LENGTH = 4

export interface PromptRedaction {
  rawValue: string
  placeholder: string
  envVarName: string
}

export interface ContractRow {
  pageClass: string
  methodName: string
  paramName: string
  paramType: IRParamType
  isSecret: boolean
  envVarName?: string
  /** Captured raw fill value (empty for non-fill params like booleans). */
  rawValue: string
}

export type Redact = (value: string) => string

export function slugifyFlow(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'flow'
}

/** Variants of sensitive fields across the whole recording (a different value gets its own env var). */
export function fillVariantsOf(pages: IRPage[]): FillVariant[] {
  return deriveFillVariants(pages.flatMap((p) => p.steps))
}

/** Env var a sensitive method parameter reads — the same name the generated code uses. */
export function methodParamEnvVar(
  variants: readonly FillVariant[],
  method: InferredMethod,
  paramIndex: number,
  paramName: string,
): string {
  const fill = method.steps.filter((s) => s.action === 'fill')[paramIndex]
  return fillEnvVarName(variants, fill?.element, fill?.value ?? '') ?? getEnvVarName(paramName)
}

export function collectContractRows(pages: IRPage[]): ContractRow[] {
  const rows: ContractRow[] = []
  const variants = fillVariantsOf(pages)
  for (const page of pages) {
    for (const method of page.inferredMethods ?? []) {
      const fillSteps = method.steps.filter((s) => s.action === 'fill')
      method.params.forEach((paramName, idx) => {
        const isSecret = method.paramSecret?.[idx] ?? false
        const paramType = method.paramTypes?.[idx] ?? 'string'
        const fill = fillSteps[idx]
        rows.push({
          pageClass: page.className,
          methodName: method.name,
          paramName,
          paramType,
          isSecret,
          envVarName: isSecret ? methodParamEnvVar(variants, method, idx, paramName) : undefined,
          rawValue: fill?.value ?? '',
        })
      })
    }
  }
  return rows
}

/** Secret rows long enough to mask, each mapped to its `[REDACTED:<ENV>]` placeholder. */
export function buildRedactionMap(rows: ContractRow[]): PromptRedaction[] {
  return rows
    .filter((r) => r.isSecret && r.envVarName && r.rawValue.length >= MIN_REDACTABLE_LENGTH)
    .map((r) => ({
      rawValue: r.rawValue,
      envVarName: r.envVarName!,
      placeholder: `[REDACTED:${r.envVarName!}]`,
    }))
}

/** Longest values first so a secret that contains another one is masked whole. */
export function buildRedactor(map: PromptRedaction[]): Redact {
  if (map.length === 0) return (value) => value
  const ordered = [...map].sort((a, b) => b.rawValue.length - a.rawValue.length)
  return (value) => ordered.reduce((acc, r) => acc.split(r.rawValue).join(r.placeholder), value)
}
