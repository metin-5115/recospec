import {
  BEARER_TOKEN_PATTERN,
  JWT_PATTERN,
  REDACTED_PLACEHOLDER,
  SENSITIVE_KEY_PATTERNS,
} from './constants'

/** `"<key containing a sensitive word>": "<value>"` — the value may be cut off by the size cap. */
const SENSITIVE_PAIR_PATTERN = new RegExp(
  `("[^"\\\\]*(?:${SENSITIVE_KEY_PATTERNS.map((p) => p.source).join('|')})[^"\\\\]*"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"?`,
  'gi',
)

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((p) => p.test(key))
}

/** Masks JWTs and bearer credentials wherever they appear in running text. */
function maskTokens(text: string): string {
  return text
    .replace(JWT_PATTERN, REDACTED_PLACEHOLDER)
    .replace(BEARER_TOKEN_PATTERN, `$1${REDACTED_PLACEHOLDER}`)
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return maskTokens(value)
  if (Array.isArray(value)) return value.map(redactValue)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) {
      out[key] = isSensitiveKey(key) ? REDACTED_PLACEHOLDER : redactValue(inner)
    }
    return out
  }
  return value
}

function looksLikeJson(body: string, contentType: string | undefined): boolean {
  if (contentType?.toLowerCase().includes('json')) return true
  const first = body.trimStart().charAt(0)
  return first === '{' || first === '['
}

/**
 * A captured response body with its secrets masked, so it can be stored and written into a mock.
 * JSON is masked by key (token, password, email, …) at any depth; text — and JSON the size cap
 * cut off — falls back to patterns for key/value pairs, JWTs and bearer tokens.
 */
export function redactNetworkBody(body: string, contentType: string | undefined): string {
  if (looksLikeJson(body, contentType)) {
    try {
      return JSON.stringify(redactValue(JSON.parse(body)))
    } catch {
      return maskTokens(body.replace(SENSITIVE_PAIR_PATTERN, `$1"${REDACTED_PLACEHOLDER}"`))
    }
  }
  return maskTokens(body)
}
