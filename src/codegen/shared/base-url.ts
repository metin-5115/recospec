import { BASE_URL_ENV_VAR, DEFAULT_BASE_URL } from '@shared/constants'

/** Origin a generated project is configured with: the recorded one, else the dev-server default. */
export function configuredBaseUrl(baseUrl: string | undefined): string {
  return baseUrl ?? DEFAULT_BASE_URL
}

function singleQuoted(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** `process.env.BASE_URL ?? 'https://shop.test'` — the config line Playwright and Cypress share. */
export function nodeBaseUrlExpr(baseUrl: string | undefined): string {
  return `process.env.${BASE_URL_ENV_VAR} ?? ${singleQuoted(configuredBaseUrl(baseUrl))}`
}
