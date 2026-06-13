import { classifyText } from './text-classifier'

/**
 * Boolean convenience over `classifyText` for context-free call sites
 * (fingerprint masking, assertion suggestions, quick strategy hints).
 *
 * The full classifier (`classifyText`) is the single source of truth — it
 * adds structural-template, mutation, and role-context signals when DOM
 * context is available. This wrapper answers only "does this text READ as a
 * value (date / price / number / time / percent)?" with no context.
 */
export function isDynamicValue(text: string | null | undefined): boolean {
  return classifyText(text, {}) !== 'stable-label'
}
