import { slugifyKebab } from '@shared/slug'

export const FLOW_SLUG_FALLBACK = 'flow'

/** `login-with-valid-user` — the stem of every file a flow owns (spec, feature, snapshots). */
export function flowSlug(name: string): string {
  return slugifyKebab(name, FLOW_SLUG_FALLBACK)
}

/** `login_with_valid_user` — Python module stem. */
export function flowSnakeSlug(name: string): string {
  return flowSlug(name).replace(/-/g, '_')
}

/** `LoginWithValidUser` — Java class stem. A leading digit would not be a legal identifier. */
export function flowPascalName(name: string): string {
  const pascal = flowSlug(name)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return /^\d/.test(pascal)
    ? `${FLOW_SLUG_FALLBACK.charAt(0).toUpperCase()}${FLOW_SLUG_FALLBACK.slice(1)}${pascal}`
    : pascal
}
