import type { RecordedAction } from '@shared/types/action'
import { SECRET_MASK_LABEL, SECRET_MASK_ORDINAL_SEPARATOR } from '@shared/constants'
import { redactNetworkBody } from '@shared/network-redaction'
import { normalizeActions } from '../normalizer/action-normalizer'
import { getEnvVarName, getParameterName, isSensitiveField } from '../planner/sensitive-detector'

export interface MaskedActions {
  actions: RecordedAction[]
  /** The raw values that were replaced, for the leak guard. */
  secrets: string[]
}

/** `[REDACTED:RECOSPEC_PASSWORD]`, then `[REDACTED:RECOSPEC_PASSWORD#2]` for the next distinct value. */
function maskText(envVarName: string, ordinal: number): string {
  const suffix = ordinal > 1 ? `${SECRET_MASK_ORDINAL_SEPARATOR}${ordinal}` : ''
  return `[${SECRET_MASK_LABEL}:${envVarName}${suffix}]`
}

/** Typed text lives in `payload.value`; a value assertion stores what it expects there. */
function secretPayloadKey(action: RecordedAction): 'value' | 'expected' | undefined {
  if (action.type === 'fill' || action.type === 'select') return 'value'
  if (action.type === 'assert' && action.payload?.assertionType === 'value') return 'expected'
  return undefined
}

/** The IR element the action targets — the same one the generators classify as secret or not. */
function sensitiveEnvVar(action: RecordedAction): string | undefined {
  const step = normalizeActions([action]).flatSteps[0]
  if (!step?.element || !isSensitiveField(step.element)) return undefined
  return getEnvVarName(getParameterName(step.element))
}

/**
 * Copies the actions with the value typed into every sensitive field replaced by a placeholder.
 * Equal values get equal placeholders and different values different ones, so a recording that
 * types a wrong and a valid password still generates two environment variables.
 */
export function maskSecretActions(actions: readonly RecordedAction[]): MaskedActions {
  const ordinals = new Map<string, Map<string, number>>()
  const secrets: string[] = []

  const masked = actions.map((action): RecordedAction => {
    if (action.type === 'network' && typeof action.payload?.responseBody === 'string') {
      const body = redactNetworkBody(
        action.payload.responseBody,
        typeof action.payload.contentType === 'string' ? action.payload.contentType : undefined,
      )
      return { ...action, payload: { ...action.payload, responseBody: body } }
    }

    const key = secretPayloadKey(action)
    const raw = key ? action.payload?.[key] : undefined
    const typed = key && typeof raw === 'string' && raw !== '' ? raw : undefined
    const markup = action.target?.elementSnapshot.attributes?.value
    if (typed === undefined && !markup) return action
    const envVarName = sensitiveEnvVar(action)
    if (!envVarName) return action

    let result = action
    if (key && typed !== undefined) {
      const seen = ordinals.get(envVarName) ?? new Map<string, number>()
      ordinals.set(envVarName, seen)
      if (!seen.has(typed)) seen.set(typed, seen.size + 1)
      secrets.push(typed)
      result = {
        ...result,
        payload: { ...result.payload, [key]: maskText(envVarName, seen.get(typed)!) },
      }
    }
    if (markup && result.target) {
      // A prefilled field carries its value as a `value` attribute of the element snapshot.
      secrets.push(markup)
      const attributes = { ...result.target.elementSnapshot.attributes }
      delete attributes.value
      result = {
        ...result,
        target: {
          ...result.target,
          elementSnapshot: { ...result.target.elementSnapshot, attributes },
        },
      }
    }
    return result
  })

  return { actions: masked, secrets }
}
