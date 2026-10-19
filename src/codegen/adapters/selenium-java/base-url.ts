import { BASE_URL_ENV_VAR } from '@shared/constants'
import { javaStr } from './locator'

/**
 * Java expression for the URL a driver should open. A route is joined to the `BASE_URL`
 * environment variable, with the recorded origin as its default; a URL on another origin is
 * written out in full.
 */
export function javaUrlExpr(baseUrl: string | undefined, target: string): string {
  if (baseUrl && target.startsWith('/')) {
    return `System.getenv().getOrDefault(${javaStr(BASE_URL_ENV_VAR)}, ${javaStr(baseUrl)}) + ${javaStr(target)}`
  }
  return javaStr(target)
}
