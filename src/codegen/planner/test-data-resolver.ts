import type { IRElement, TestDataConfig, TestDataParam } from '../ir/types'
import { isSensitiveField, getParameterName, getEnvVarName } from './sensitive-detector'
import { SECRET_PARAM_DEFAULT_VALUE } from '@shared/constants'

/**
 * Per-element resolution telling adapters how to render a value substitution.
 * `useEnvVar=true` → emit framework-idiomatic env var lookup with fallback.
 * `useEnvVar=false` → emit the raw literal.
 */
export interface ResolvedValue {
  literal: string
  isSecret: boolean
  paramName: string
  envVarName: string
  defaultValue: string
  useEnvVar: boolean
}

/**
 * Stable key used to align an IR element with a `TestDataParam` entry.
 * Today this is just the IR element name (already de-duped per session); a
 * future refactor can broaden it without touching call sites.
 */
export function testDataKey(element: IRElement | undefined): string | undefined {
  return element?.name
}

function findParam(
  config: TestDataConfig | undefined,
  element: IRElement | undefined,
): TestDataParam | undefined {
  if (!config?.params?.length || !element) return undefined
  const k = testDataKey(element)
  if (!k) return undefined
  return config.params.find((p) => p.key === k)
}

/**
 * Resolve a fill value for an IR step. The adapter receives the metadata and
 * picks its idiomatic env-var helper (`process.env.X`, `os.environ.get`, …).
 *
 * Resolution order:
 *  1. Explicit override from `TestDataConfig` wins (user toggled "use env var"
 *     or edited the default value in the side panel).
 *  2. Otherwise, `isSensitiveField(element)` decides — if true the value is
 *     parameterized via env var by default; if false it stays a literal.
 */
export function resolveTestData(
  element: IRElement | undefined,
  recordedValue: string,
  config?: TestDataConfig,
): ResolvedValue {
  const override = findParam(config, element)
  const detectedSecret = isSensitiveField(element)
  const isSecret = override?.isSecret ?? detectedSecret

  const paramName = override?.name ?? getParameterName(element)
  const envVarName = override?.envVarName ?? getEnvVarName(paramName)

  // For secret values, never let the recorded value bleed into the default —
  // it would defeat the whole point of redaction. Fall back to the configured
  // safe default instead.
  const defaultValue = override
    ? override.defaultValue
    : isSecret
      ? SECRET_PARAM_DEFAULT_VALUE
      : recordedValue

  const useEnvVar = override?.useEnvVar ?? isSecret

  return {
    literal: recordedValue,
    isSecret,
    paramName,
    envVarName,
    defaultValue,
    useEnvVar,
  }
}

/**
 * Build a default `TestDataConfig` by walking all elements that participate in
 * `fill` steps and detecting their sensitivity. Used to seed the side-panel
 * UI before the user has made any edits.
 */
export function buildDefaultTestDataConfig(elements: IRElement[]): TestDataConfig {
  const seen = new Set<string>()
  const params: TestDataParam[] = []
  for (const el of elements) {
    const key = testDataKey(el)
    if (!key || seen.has(key)) continue
    if (!isSensitiveField(el)) continue
    seen.add(key)
    const name = getParameterName(el)
    params.push({
      key,
      name,
      isSecret: true,
      defaultValue: SECRET_PARAM_DEFAULT_VALUE,
      useEnvVar: true,
      envVarName: getEnvVarName(name),
    })
  }
  return { params }
}
