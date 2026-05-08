export const DB_NAME = 'PlayForgeDB' as const
export const DB_VERSION = 1 as const
export const LOCATOR_FALLBACK_COUNT = 2 as const
export const MAX_TEXT_CONTENT_LENGTH = 100 as const
export const MAX_DYNAMIC_ID_ENTROPY = 3.5 as const
export const SESSION_NAME_PREFIX = 'Session' as const
export const CONTENT_REINJECT_MAX_ATTEMPTS = 3 as const
export const GC_ARCHIVED_DAYS = 30 as const
export const STORAGE_QUOTA_WARN_RATIO = 0.8 as const
/** Cap for captured request/response bodies — keeps IndexedDB usage bounded. */
export const NETWORK_BODY_MAX_BYTES = 50_000 as const
/** Substrings that exclude a request from capture (extension internals, browser noise). */
export const NETWORK_URL_BLOCKLIST = ['chrome-extension://', 'moz-extension://'] as const
