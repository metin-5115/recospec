type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const PREFIX = '[Recospec]'
const IS_DEV = import.meta.env.DEV

const REDACTED = '***'
const SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /password/i,
  /passwd/i,
  /pwd/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
]

/** Returns true when a property name suggests its value is a secret. */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key))
}

/**
 * Walk a value and replace any property whose name looks like a secret with
 * `***`. Loop-safe via a visited set; non-mutating.
 */
function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value as object)) return '[circular]'
  seen.add(value as object)
  // Error's message/stack are non-enumerable, so the generic walk below would yield `{}`.
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, seen))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : redact(v, seen)
  }
  return out
}

function log(level: LogLevel, ...args: unknown[]): void {
  if (!IS_DEV && level !== 'error') return
  const safe = args.map((a) => redact(a))
  // eslint-disable-next-line no-console
  console[level](PREFIX, ...safe)
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
  /** Exposed so adapters can reuse the same redaction pass when serializing. */
  redact,
}
