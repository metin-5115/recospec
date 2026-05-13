export const DB_NAME = 'PlayForgeDB' as const
/** Latest schema version. Bumping triggers Dexie upgrade callbacks. */
export const DB_VERSION = 2 as const
/**
 * Number of recorded steps the background waits for before computing the
 * flow signature and probing the DB for prior matching sessions. Three
 * steps is enough shape to discriminate `login` from `checkout` while
 * staying cheap to compute.
 */
export const ITERATION_SIGNATURE_STEPS = 3 as const
export const LOCATOR_FALLBACK_COUNT = 2 as const
export const MAX_TEXT_CONTENT_LENGTH = 100 as const
export const MAX_DYNAMIC_ID_ENTROPY = 3.5 as const
/**
 * Minimum trailing digit-suffix length that classifies an id as dynamic.
 * Below this, suffixes like `BVD-135` or `order-1234` are treated as semantic
 * domain ids and accepted by the locator engine.
 */
export const MIN_DYNAMIC_ID_DIGIT_SUFFIX = 5 as const
export const SESSION_NAME_PREFIX = 'Session' as const
export const CONTENT_REINJECT_MAX_ATTEMPTS = 3 as const
export const GC_ARCHIVED_DAYS = 30 as const
export const STORAGE_QUOTA_WARN_RATIO = 0.8 as const
/** Cap for captured request/response bodies — keeps IndexedDB usage bounded. */
export const NETWORK_BODY_MAX_BYTES = 50_000 as const
/** Substrings that exclude a request from capture (extension internals, browser noise). */
export const NETWORK_URL_BLOCKLIST = ['chrome-extension://', 'moz-extension://'] as const
/**
 * Auto-wait detection: how long to watch for network/spinner activity after a
 * recorded click before deciding whether to inject a `wait` IR step.
 */
export const AUTO_WAIT_NETWORK_DEBOUNCE_MS = 500 as const
/** Default timeout (ms) emitted by adapters when rendering an auto-detected wait. */
export const AUTO_WAIT_DEFAULT_TIMEOUT_MS = 10_000 as const
/** CSS selectors that qualify a DOM node as a loading spinner. */
export const SPINNER_SELECTORS = [
  '[role=progressbar]',
  '.spinner',
  '.loading',
  '[aria-busy=true]',
] as const

/**
 * Field-name regexes that classify an input as sensitive (secret) test data.
 * Matched case-insensitively against `id`, `name`, `data-testid`, and the
 * inferred IR element name.
 *
 * Scope is intentionally tight (password / secret / token / apiKey / email)
 * — usernames are too easily confused with display names and are surfaced
 * only via the autocomplete attribute.
 */
export const SENSITIVE_FIELD_PATTERNS: readonly RegExp[] = [
  /password/i,
  /passwd/i,
  /pwd/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /email/i,
]

/** Autocomplete attribute values that mark an input as sensitive. */
export const SENSITIVE_AUTOCOMPLETE_VALUES: readonly string[] = [
  'current-password',
  'new-password',
  'one-time-code',
  'email',
  'username',
]

/** Default value substituted for a secret parameter when no env var is set. */
export const SECRET_PARAM_DEFAULT_VALUE = 'change-me' as const

/** Prefix for environment variable names emitted by adapters. */
export const ENV_VAR_PREFIX = 'PLAYFORGE_' as const

/** Maximum number of locators evaluated in a single live "Test on Page" run. */
export const LOCATOR_VALIDATION_MAX_TARGETS = 100 as const

/** Duration (ms) to flash the on-page overlay when the user clicks "Show me". */
export const LOCATOR_VALIDATION_HIGHLIGHT_DURATION_MS = 1000 as const
