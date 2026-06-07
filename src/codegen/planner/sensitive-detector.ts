import type { IRElement } from '../ir/types'
import {
  SENSITIVE_FIELD_PATTERNS,
  SENSITIVE_AUTOCOMPLETE_VALUES,
  ENV_VAR_PREFIX,
} from '@shared/constants'

/**
 * Returns true when the element's input metadata or surrounding identifiers
 * suggest the value is sensitive (password, token, email, OTP, …) and
 * therefore should be parameterized with an env var instead of being
 * hardcoded in the generated code.
 */
export function isSensitiveField(el: IRElement | undefined): boolean {
  if (!el) return false

  if (el.inputType?.toLowerCase() === 'password') return true

  const autocomplete = el.elementSnapshot?.autocomplete?.toLowerCase()
  if (autocomplete && SENSITIVE_AUTOCOMPLETE_VALUES.includes(autocomplete)) return true

  const candidates = [
    el.name,
    el.elementSnapshot?.id,
    el.elementSnapshot?.testId,
    el.elementSnapshot?.fieldName,
  ].filter((s): s is string => Boolean(s))

  return candidates.some((c) => SENSITIVE_FIELD_PATTERNS.some((re) => re.test(c)))
}

/**
 * Maps a sensitive element to a canonical parameter name (`password`,
 * `email`, `apiKey`, `oneTimeCode`, …). Falls back to a slug derived from
 * the element name when no canonical match applies.
 */
export function getParameterName(el: IRElement | undefined): string {
  if (!el) return 'value'

  const autocomplete = el.elementSnapshot?.autocomplete?.toLowerCase()
  if (autocomplete === 'one-time-code') return 'oneTimeCode'
  if (autocomplete === 'current-password' || autocomplete === 'new-password') return 'password'
  if (autocomplete === 'email') return 'email'
  if (autocomplete === 'username') return 'username'

  if (el.inputType?.toLowerCase() === 'password') return 'password'

  const haystack = [el.name, el.elementSnapshot?.id, el.elementSnapshot?.fieldName]
    .filter((s): s is string => Boolean(s))
    .join(' ')

  if (/api[-_]?key/i.test(haystack)) return 'apiKey'
  if (/token/i.test(haystack)) return 'token'
  if (/secret/i.test(haystack)) return 'secret'
  if (/password|passwd|pwd/i.test(haystack)) return 'password'
  if (/\botp\b|one[-_]?time[-_]?code/i.test(haystack)) return 'oneTimeCode'
  if (/email/i.test(haystack)) return 'email'
  if (/username/i.test(haystack)) return 'username'

  // Last resort: derive a camelCase slug from the IR element name.
  const stripped = el.name.replace(
    /Input$|Button$|Btn$|Link$|Select$|Field$|Box$|Toggle$|Checkbox$|Radio$/,
    '',
  )
  return stripped ? stripped.charAt(0).toLowerCase() + stripped.slice(1) : 'value'
}

/**
 * Converts a camelCase or kebab/snake parameter name to a
 * SCREAMING_SNAKE_CASE env var name, prefixed with `RECOSPEC_`.
 *
 *   getEnvVarName('password')      → 'RECOSPEC_PASSWORD'
 *   getEnvVarName('apiKey')        → 'RECOSPEC_API_KEY'
 *   getEnvVarName('oneTimeCode')   → 'RECOSPEC_ONE_TIME_CODE'
 */
export function getEnvVarName(paramName: string): string {
  const snake = paramName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toUpperCase()
    .replace(/^_+|_+$/g, '')
  return `${ENV_VAR_PREFIX}${snake || 'PARAM'}`
}
