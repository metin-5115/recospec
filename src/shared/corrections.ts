import type { ScoredLocator, ElementFingerprint } from './types/locator'

/**
 * User-correction telemetry — the second calibration signal (spec §8).
 *
 * When a user manually replaces a generated locator, we record the triple
 * (rejected locator, chosen selector, element fingerprint) so a future
 * calibration pass can learn which strategies users distrust in practice.
 *
 * Privacy: OPT-IN, default OFF. Records carry ONLY selector strings and
 * structural features — never page URLs, input values, or any PII. This module
 * is pure (builds + serializes records); the host (VS Code) owns the file I/O
 * and the opt-in gate. Collection only — model training is out of scope.
 */

export interface CorrectionRecord {
  /** Schema version so future readers can migrate. */
  v: 1
  /** ISO-8601 timestamp (host-supplied — this module takes no clock). */
  at: string
  /** The locator the engine proposed and the user threw away. */
  rejected: {
    strategy: ScoredLocator['strategy']
    selector: string
    score: number
  }
  /** The selector string the user chose instead. */
  chosen: string
  /** Structural fingerprint of the element (dynamic values already masked). */
  fingerprint: ElementFingerprint
}

const SENSITIVE_VALUE = /[?#]|https?:\/\//i

/**
 * Sanitize a fingerprint for telemetry: drop attribute VALUES that look like
 * URLs / query strings (defense-in-depth — the fingerprint masks dynamic
 * values already, but user pages are unpredictable). Keys are kept.
 */
function sanitizeFingerprint(fp: ElementFingerprint): ElementFingerprint {
  const attributes: Record<string, string> = {}
  for (const [k, v] of Object.entries(fp.attributes)) {
    attributes[k] = SENSITIVE_VALUE.test(v) ? '«redacted»' : v
  }
  return { ...fp, attributes }
}

/** Build a single correction record. `at` is injected (no clock in pure code). */
export function buildCorrectionRecord(input: {
  rejected: ScoredLocator
  chosen: string
  fingerprint: ElementFingerprint
  at: string
}): CorrectionRecord {
  return {
    v: 1,
    at: input.at,
    rejected: {
      strategy: input.rejected.strategy,
      selector:
        typeof input.rejected.selector === 'string'
          ? input.rejected.selector
          : JSON.stringify(input.rejected.selector),
      score: input.rejected.score,
    },
    chosen: input.chosen,
    fingerprint: sanitizeFingerprint(input.fingerprint),
  }
}

/** Serialize a record as one JSONL line (newline-terminated). */
export function serializeCorrection(record: CorrectionRecord): string {
  return JSON.stringify(record) + '\n'
}

/** Parse a corrections.jsonl body into records, skipping malformed lines. */
export function parseCorrections(body: string): CorrectionRecord[] {
  const out: CorrectionRecord[] = []
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as CorrectionRecord
      if (parsed.v === 1 && parsed.rejected && parsed.chosen) out.push(parsed)
    } catch {
      // skip malformed line — one bad row never breaks the whole file
    }
  }
  return out
}
