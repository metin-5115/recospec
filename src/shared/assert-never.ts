import { logger } from './logger'

/**
 * Closes a `switch` over a discriminated union: if a new variant is added and the switch does not
 * handle it, this call stops compiling. At run time (a message from a newer or older build) it
 * only logs — an unknown message must never take the worker down.
 */
export function assertNever(value: never, context: string): undefined {
  logger.warn(`[${context}] Unhandled variant`, value)
  return undefined
}
