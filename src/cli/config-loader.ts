import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FrameworkId } from '@shared/types/generated'

/** Persisted CLI configuration. Mirrors the schema written by `playforge init`. */
export interface PlayforgeRc {
  /** Pinned framework — when set, `playforge add` skips auto-detection. */
  framework?: FrameworkId
  /** Default value for the `--bdd` flag. */
  bdd?: boolean
  /** Path mapping overrides — keyed by adapter id. Reserved for P7.3+. */
  paths?: {
    pagesDir?: string
    testsDir?: string
    featuresDir?: string
  }
  /** Schema version. We only ship `1` today but reserve the key for forward-compat. */
  version?: 1
}

export const RC_FILENAME = '.playforgerc.json'

export interface LoadedRc {
  config: PlayforgeRc
  /** Absolute path of the rc file the config was read from. */
  source: string
}

/** Read `.playforgerc.json` from `projectDir`, or `null` if missing/malformed. */
export function loadRc(projectDir: string): LoadedRc | null {
  const abs = resolve(projectDir, RC_FILENAME)
  if (!existsSync(abs)) return null
  try {
    const parsed = JSON.parse(readFileSync(abs, 'utf8')) as PlayforgeRc
    return { config: parsed, source: abs }
  } catch {
    // Malformed file — surface to the caller by returning null; caller logs.
    return null
  }
}

export const DEFAULT_RC: PlayforgeRc = {
  version: 1,
}
