import { pyStr } from './locator'

/**
 * Python expression for the URL a driver should open. A route is joined to the `base_url` the
 * `driver` fixture carries (conftest reads it from `BASE_URL`); the recorded origin only stands in
 * when the project was set up without Recospec's conftest.
 */
export function pyUrlExpr(receiver: string, baseUrl: string | undefined, target: string): string {
  if (baseUrl && target.startsWith('/')) {
    return `getattr(${receiver}, 'base_url', ${pyStr(baseUrl)}) + ${pyStr(target)}`
  }
  return pyStr(target)
}
