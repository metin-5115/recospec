import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  buildCorrectionRecord,
  serializeCorrection,
  parseCorrections,
  type CorrectionRecord,
} from '@shared/corrections'
import type { ScoredLocator, ElementFingerprint } from '@shared/types/locator'

/**
 * Host-side persistence for user-correction telemetry (spec §8). Pure Node fs —
 * no `vscode` import — so it is unit-testable against a temp dir. The opt-in
 * gate and the manual-edit trigger live in `extension.ts`; this module only
 * appends/reads when asked.
 *
 * File: `<workspace>/.recospec/corrections.jsonl`. JSONL so appends are cheap
 * and a corrupt line never invalidates the rest.
 */
export function correctionsFilePath(projectDir: string): string {
  return join(projectDir, '.recospec', 'corrections.jsonl')
}

/** Append one correction. `at` defaults to now (host owns the clock). */
export function appendCorrection(
  projectDir: string,
  input: { rejected: ScoredLocator; chosen: string; fingerprint: ElementFingerprint; at?: string },
): CorrectionRecord {
  const record = buildCorrectionRecord({
    rejected: input.rejected,
    chosen: input.chosen,
    fingerprint: input.fingerprint,
    at: input.at ?? new Date().toISOString(),
  })
  const path = correctionsFilePath(projectDir)
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, serializeCorrection(record), 'utf8')
  return record
}

/** Read all recorded corrections (empty when the file does not exist). */
export function loadCorrections(projectDir: string): CorrectionRecord[] {
  const path = correctionsFilePath(projectDir)
  if (!existsSync(path)) return []
  return parseCorrections(readFileSync(path, 'utf8'))
}
