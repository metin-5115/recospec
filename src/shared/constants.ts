import type { LocatorStrategyName } from './types/locator'

export const DB_NAME = 'RecospecDB' as const
/** Latest schema version. Bumping triggers Dexie upgrade callbacks. */
export const DB_VERSION = 3 as const
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
/** Cap for the element text stored on a recorded snapshot (events and assertion probes). */
export const SNAPSHOT_TEXT_MAX_LENGTH = 200 as const
/**
 * Page-origin localStorage key that mirrors the closed-shadow opt-in from the
 * ISOLATED content script to the MAIN-world proxy (the only synchronous
 * cross-world channel available at `document_start`).
 */
export const PIERCE_CLOSED_SHADOW_FLAG_KEY = 'recospec:pierce-closed-shadow' as const
/**
 * Page-origin localStorage key the ISOLATED content script sets while a recording is
 * active. The MAIN-world network proxy reads it synchronously per request so it only
 * intercepts fetch/XHR during a recording and stays inert otherwise.
 */
export const NETWORK_CAPTURE_FLAG_KEY = 'recospec:capture-network' as const
/** Response content types whose bodies are never captured (streams and binary payloads). */
export const NETWORK_BODY_SKIP_CONTENT_TYPES = [
  'text/event-stream',
  'image/',
  'audio/',
  'video/',
  'font/',
  'multipart/',
  'application/octet-stream',
  'application/pdf',
  'application/zip',
  'application/gzip',
  'application/wasm',
] as const
export const SESSION_NAME_PREFIX = 'Session' as const
export const CONTENT_REINJECT_MAX_ATTEMPTS = 3 as const
export const GC_ARCHIVED_DAYS = 30 as const
export const STORAGE_QUOTA_WARN_RATIO = 0.8 as const
/** CustomEvent the MAIN-world network proxy dispatches for the ISOLATED content script. */
export const NETWORK_CAPTURE_EVENT_NAME = 'recospec:network' as const
/** Cap for captured request/response bodies — keeps IndexedDB usage bounded. */
export const NETWORK_BODY_MAX_BYTES = 50_000 as const
/** Name of the alarm that keeps the MV3 service worker alive during a replay. */
export const REPLAY_KEEPALIVE_ALARM_NAME = 'recospec-replay-keepalive' as const
/** How long the replay waits for the content script to answer one step. */
export const REPLAY_STEP_RESPONSE_TIMEOUT_MS = 8_000 as const
/** How long the replay waits for a navigation to settle before continuing. */
export const REPLAY_NAVIGATION_SETTLE_TIMEOUT_MS = 10_000 as const
/** Pause between replayed steps so the page can react before the next one. */
export const REPLAY_STEP_PACING_MS = 200 as const
/** How long the background waits for the content script to answer a locator validation. */
export const LOCATOR_VALIDATION_TIMEOUT_MS = 8_000 as const
/** Largest repeated-container group the composed strategy will probe (keeps it O(n) cheap). */
export const MAX_CONTAINER_GROUP_SIZE = 400 as const
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
  // Payment card data: number, security code and expiry.
  /card.?number/i,
  /cvv|cvc/i,
  /security.?code/i,
  /expir/i,
]

/** Autocomplete attribute values that mark an input as sensitive. */
export const SENSITIVE_AUTOCOMPLETE_VALUES: readonly string[] = [
  'current-password',
  'new-password',
  'one-time-code',
  'email',
  'username',
  'cc-number',
  'cc-csc',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
]

/** Default value substituted for a secret parameter when no env var is set. */
export const SECRET_PARAM_DEFAULT_VALUE = 'change-me' as const

/** Prefix for environment variable names emitted by adapters. */
export const ENV_VAR_PREFIX = 'RECOSPEC_' as const

/** How long a "Copied!" confirmation stays visible in the side panel. */
export const COPY_FEEDBACK_MS = 2_000 as const

/** Words kept when an element name is derived from a label, so a sentence stays a usable identifier. */
export const ELEMENT_NAME_MAX_WORDS = 5 as const

/** Max characters of an element's text content echoed into the exported prompt. */
export const PROMPT_ELEMENT_TEXT_PREVIEW_MAX = 80 as const

/** Headers the exported prompt tells Claude to strip from mocked fixtures. */
export const PROMPT_STRIPPED_HEADERS = 'Authorization, Cookie, Set-Cookie' as const

/** Max characters of an element's visible text echoed into the LLM context. */
export const LLM_CONTEXT_TEXT_MAX = 40 as const

/** Fallback locators kept per element in the LLM context. */
export const LLM_CONTEXT_MAX_FALLBACKS = 2 as const

/** Neighbour texts kept per element fingerprint in the LLM context. */
export const LLM_CONTEXT_MAX_NEIGHBORS = 3 as const

/** Max characters of each neighbour text in the LLM context. */
export const LLM_CONTEXT_NEIGHBOR_TEXT_MAX = 24 as const

/** Trailing DOM-path segments kept per element fingerprint in the LLM context. */
export const LLM_CONTEXT_DOM_PATH_SEGMENTS = 4 as const

/** Fallback locators longer than this are dropped from the LLM context (truncating would break them). */
export const LLM_CONTEXT_LOCATOR_MAX = 120 as const

/** Max distinct same-origin requests listed in the LLM context's network section. */
export const LLM_CONTEXT_MAX_REQUESTS = 25 as const

/** Placeholder the fingerprint capture writes in place of a value classified as dynamic data. */
export const DYNAMIC_VALUE_MASK = '«dynamic»' as const

/** Rough characters-per-token ratio used for LLM context size estimates. */
export const CHARS_PER_TOKEN_ESTIMATE = 4 as const

/** Maximum number of locators evaluated in a single live "Test on Page" run. */
export const LOCATOR_VALIDATION_MAX_TARGETS = 100 as const

/** Times the side panel tries to hand `CODE_GENERATE` to the background worker before reporting failure. */
export const CODEGEN_MAX_ATTEMPTS = 3 as const

/** Pause between two `CODE_GENERATE` hand-off attempts, in milliseconds. */
export const CODEGEN_RETRY_DELAY_MS = 600 as const

/** How long a freshly recorded step stays highlighted in the step list, in milliseconds. */
export const STEP_FLASH_DURATION_MS = 800 as const

/**
 * Stability score (0–100) at or above which a primary locator is considered
 * acceptable. A captured step whose primary scores below this is flagged
 * "weak" in the UI. Aligned with the Medium/Weak boundary in `scoreTier`
 * so the score badge and the quality warning always agree.
 */
export const LOCATOR_WEAK_SCORE_THRESHOLD = 50 as const

/**
 * Distinct healthy flat survivors (score >= LOCATOR_WEAK_SCORE_THRESHOLD, not
 * positional) at which the engine stops building the XPath candidate: a primary
 * plus one healthy fallback already give self-healing a real second chance.
 */
export const XPATH_GATE_MIN_HEALTHY_SURVIVORS = 2 as const

/**
 * Best flat-survivor score at which an XPath can no longer outrank it. The
 * XPath strategy tops out at 65 (base 50 + attribute tier 1), so a survivor at
 * or above this keeps the primary identical with or without the XPath.
 */
export const XPATH_GATE_PRIMARY_SAFE_SCORE = 65 as const

/** Duration (ms) to flash the on-page overlay when the user clicks "Show me". */
export const LOCATOR_VALIDATION_HIGHLIGHT_DURATION_MS = 1000 as const

/**
 * Outbound URLs surfaced by the Help dropdown. Centralised so the bug-report
 * and feedback routes can be updated without grepping the JSX. Internal
 * paths (demo page, getting-started doc) are resolved via
 * `chrome.runtime.getURL` at click time rather than encoded here.
 */
/**
 * Short human-readable label shown next to each step's locator. Distinct from
 * the internal `LocatorStrategyName` so the UI can render compact tags
 * (e.g. `aria` instead of `aria-label`) without leaking the implementation
 * naming throughout the side panel.
 */
export const STRATEGY_DISPLAY_NAME: Record<LocatorStrategyName, string> = {
  testid: 'test-id',
  'test-attr': 'test-attr',
  'aria-label': 'aria',
  'aria-labelledby': 'aria-ref',
  'role-name': 'role',
  label: 'label',
  text: 'text',
  id: 'id',
  css: 'css',
  xpath: 'xpath',
  composed: 'scoped',
  template: 'template',
  placeholder: 'placeholder',
  alt: 'alt',
  title: 'title',
  name: 'name',
  href: 'href',
  layout: 'layout',
}

export const EXTERNAL_URLS = {
  reportBug: 'https://github.com/metin-5115/recospec/issues/new?template=bug_report.yml',
  sendFeedback:
    'https://github.com/metin-5115/recospec/issues/new?template=feedback.yml&title=Feedback%3A%20',
} as const

/** Packages that expose Playwright's `chromium`, in the order the VS Code extension tries them. */
export const PLAYWRIGHT_PACKAGE_NAMES = [
  '@playwright/test',
  'playwright',
  'playwright-core',
] as const

/** One-liner shown when Playwright or its Chromium build is missing for `Recospec: Record Flow`. */
export const PLAYWRIGHT_INSTALL_COMMAND =
  'npm install -D @playwright/test && npx playwright install chromium' as const

/** Written into `.recospec/sessions/` so recordings (which hold typed values) are never committed. */
export const SESSIONS_GITIGNORE_CONTENT =
  '# Recospec recordings contain the values typed during a session. Keep them out of git.\n*\n' as const

/** Start URLs a generated test can open; about:blank and chrome: pages are not worth navigating to. */
export const NAVIGABLE_URL_PATTERN = /^(https?|file):/i

/** Environment variable that points a generated test project at another deployment. */
export const BASE_URL_ENV_VAR = 'BASE_URL' as const

/** Base URL written into a generated project config when the recording had no http(s) origin. */
export const DEFAULT_BASE_URL = 'http://localhost:3000' as const

/** Keys recorded as `keypress` steps; every other key's effect already arrives through `change`. */
export const RECORDED_KEYS = ['Enter', 'Tab', 'Escape'] as const

/** Input types where Enter activates the control, so the resulting click is the recorded step. */
export const ENTER_ACTIVATED_INPUT_TYPES = [
  'button',
  'submit',
  'reset',
  'image',
  'checkbox',
  'radio',
  'file',
] as const

/** How long after a hover a DOM mutation still counts as the hover revealing something. */
export const HOVER_DOM_CHANGE_WINDOW_MS = 1000 as const

/** Route segments `normalizeUrl` replaces with a placeholder (`/orders/:id`). */
export const DYNAMIC_ROUTE_SEGMENT_PATTERN = /^:(id|uuid)$/

/** Regex source a dynamic route segment matches in a generated URL assertion. */
export const DYNAMIC_ROUTE_SEGMENT_REGEX_SOURCE = '[^/]+' as const

/** Ends a URL regex at the end of the path (query string and fragment may follow). */
export const URL_PATH_END_REGEX_SOURCE = '(?:[?#]|$)' as const

/** Id of the assertion the generator appends when the recording contains none. */
export const FINAL_STATE_ASSERTION_ID = 'final-state-url' as const

/** Parameters whose recorded value can be the wrong one in a failed-login flow. */
export const INVALID_ELIGIBLE_PARAM_NAMES = ['password', 'oneTimeCode'] as const

/** Env var suffix of the value a failing flow typed (`RECOSPEC_PASSWORD_INVALID`). */
export const INVALID_VALUE_ENV_SUFFIX = 'INVALID' as const

/** Text that marks a message as an error (English and Turkish). */
export const ERROR_TEXT_PATTERN =
  /error|invalid|incorrect|wrong|failed|failure|denied|unauthori[sz]ed|try again|hata|geçersiz|yanlış|başarısız/i

/** Element names that hold an error message (`loginError`, `alertBanner`). */
export const ERROR_ELEMENT_NAME_PATTERN = /error|alert|invalid|failure|warning/i

/** First HTTP status that counts as a failed request. */
export const HTTP_ERROR_STATUS_MIN = 400 as const
