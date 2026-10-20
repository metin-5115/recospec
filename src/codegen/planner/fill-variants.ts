import {
  ERROR_ELEMENT_NAME_PATTERN,
  ERROR_TEXT_PATTERN,
  FINAL_STATE_ASSERTION_ID,
  HTTP_ERROR_STATUS_MIN,
  INVALID_ELIGIBLE_PARAM_NAMES,
  INVALID_VALUE_ENV_SUFFIX,
  SECRET_PARAM_DEFAULT_VALUE,
} from '@shared/constants'
import type { IRElement, IRStep, TestDataConfig, TestDataParam } from '../ir/types'
import { valueFingerprint } from '../shared/value-fingerprint'
import { getEnvVarName, getParameterName, isSensitiveField } from './sensitive-detector'
import { buildDefaultTestDataConfig, testDataKey } from './test-data-resolver'

/**
 * A different value typed into a sensitive field. It gets its own environment variable, so a
 * "wrong password" test does not read the variable that holds the valid one.
 */
export interface FillVariant {
  /** `TestDataParam.key` of the variant: `<element name>#<suffix>`. */
  key: string
  /** Key of the field's regular parameter (the element name). */
  baseKey: string
  paramName: string
  envVarName: string
  valueFingerprint: string
  /** The flow never types the field's regular value, so its base parameter is unused. */
  replacesBase: boolean
}

const ERROR_ASSERTION_TYPES: ReadonlySet<string> = new Set([
  'visible',
  'text',
  'text-contains',
  'not-empty',
  'matches',
])

function isErrorAssertion(step: IRStep): boolean {
  if (step.action !== 'assert' || step.id === FINAL_STATE_ASSERTION_ID) return false
  const detail = step.assertionDetail
  if (!detail || !ERROR_ASSERTION_TYPES.has(detail.type)) return false
  if (
    (detail.type === 'text' || detail.type === 'text-contains' || detail.type === 'matches') &&
    ERROR_TEXT_PATTERN.test(String(detail.expected ?? ''))
  ) {
    return true
  }
  return Boolean(step.element && ERROR_ELEMENT_NAME_PATTERN.test(step.element.name))
}

function isInvalidEligible(el: IRElement | undefined): boolean {
  if (!el || !isSensitiveField(el)) return false
  return (INVALID_ELIGIBLE_PARAM_NAMES as readonly string[]).includes(getParameterName(el))
}

/**
 * Whether the recorded flow ended in a failure the test is meant to check: it asserts an error
 * message, or it submits a credential and is still on the same page afterwards.
 */
export function isFailingFlow(steps: readonly IRStep[]): boolean {
  if (steps.some(isErrorAssertion)) return true

  let lastCredentialFill = -1
  steps.forEach((s, i) => {
    if (s.action === 'fill' && isInvalidEligible(s.element)) lastCredentialFill = i
  })
  if (lastCredentialFill === -1) return false

  const after = steps.slice(lastCredentialFill + 1)
  const submitAt = after.findIndex(
    (s) => s.action === 'click' || (s.action === 'keypress' && s.key === 'Enter'),
  )
  if (submitAt === -1) return false

  // Network and wait steps report where the request or page ended up, so they only count as
  // evidence of leaving the page through their route; a recording that simply stops at the
  // submit proves nothing either way.
  const fillRoute = steps[lastCredentialFill]?.pageUrl
  const afterSubmit = after.slice(submitAt + 1)
  if (afterSubmit.some((s) => s.action === 'navigate')) return false
  if (afterSubmit.some((s) => s.action !== 'network' && s.pageUrl !== fillRoute)) return false
  if (
    afterSubmit.some(
      (s) => s.action === 'network' && (s.network?.status ?? 0) >= HTTP_ERROR_STATUS_MIN,
    )
  ) {
    return true
  }
  return afterSubmit.some((s) => s.action !== 'network' && s.action !== 'wait')
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Extra environment variables a recording needs because a sensitive field was filled differently. */
export function deriveFillVariants(steps: readonly IRStep[]): FillVariant[] {
  const valuesByField = new Map<string, { element: IRElement; values: string[] }>()
  for (const step of steps) {
    if (step.action !== 'fill' || !step.element || step.value === undefined) continue
    if (!isSensitiveField(step.element)) continue
    const key = testDataKey(step.element) ?? step.element.name
    const entry = valuesByField.get(key) ?? { element: step.element, values: [] }
    if (!entry.values.includes(step.value)) entry.values.push(step.value)
    valuesByField.set(key, entry)
  }

  const failing = isFailingFlow(steps)
  const variants: FillVariant[] = []
  for (const [baseKey, { element, values }] of valuesByField) {
    const paramName = getParameterName(element)
    const canBeInvalid = isInvalidEligible(element)
    const make = (value: string, suffix: string, replacesBase: boolean): FillVariant => ({
      key: `${baseKey}#${suffix}`,
      baseKey,
      paramName: `${paramName}${capitalize(suffix.toLowerCase())}`,
      envVarName: `${getEnvVarName(paramName)}_${suffix}`,
      valueFingerprint: valueFingerprint(value),
      replacesBase,
    })

    const [first, ...others] = values
    if (first === undefined) continue
    if (failing && canBeInvalid && others.length === 0) {
      variants.push(make(first, INVALID_VALUE_ENV_SUFFIX, true))
      continue
    }
    others.forEach((value, i) => {
      variants.push(
        failing && canBeInvalid
          ? make(value, INVALID_VALUE_ENV_SUFFIX, false)
          : make(value, String(i + 2), false),
      )
    })
  }
  return variants
}

function toParam(variant: FillVariant): TestDataParam {
  return {
    key: variant.key,
    name: variant.paramName,
    isSecret: true,
    defaultValue: SECRET_PARAM_DEFAULT_VALUE,
    useEnvVar: true,
    envVarName: variant.envVarName,
    baseKey: variant.baseKey,
    valueFingerprint: variant.valueFingerprint,
  }
}

/**
 * The test-data config extended with the recording's variants. Without a config the sensitive
 * fields are seeded too, so scaffolds list every variable the generated code reads. Returns the
 * input unchanged when the recording has no variants.
 */
export function withFillVariants(
  config: TestDataConfig | undefined,
  steps: readonly IRStep[],
): TestDataConfig | undefined {
  const variants = deriveFillVariants(steps)
  if (variants.length === 0) return config

  const fillElements = steps.flatMap((s) => (s.action === 'fill' && s.element ? [s.element] : []))
  const base = config ?? buildDefaultTestDataConfig(fillElements)
  const replaced = new Set(variants.filter((v) => v.replacesBase).map((v) => v.baseKey))
  const known = new Set(base.params.map((p) => p.key))
  return {
    params: [
      ...base.params.filter((p) => !replaced.has(p.key)),
      ...variants.filter((v) => !known.has(v.key)).map(toParam),
    ],
  }
}

/** Variant a recorded value of a sensitive field belongs to; `undefined` for the regular one. */
export function fillVariantFor(
  variants: readonly FillVariant[],
  element: IRElement | undefined,
  value: string,
): FillVariant | undefined {
  const key = testDataKey(element)
  if (!key) return undefined
  const fingerprint = valueFingerprint(value)
  return variants.find((v) => v.baseKey === key && v.valueFingerprint === fingerprint)
}

/** Environment variable of a recorded value that has its own variant; `undefined` for the regular one. */
export function fillEnvVarName(
  variants: readonly FillVariant[],
  element: IRElement | undefined,
  value: string,
): string | undefined {
  return fillVariantFor(variants, element, value)?.envVarName
}
