import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FrameworkId } from '@shared/types/generated'
import type { OutputDirOverrides } from '@codegen/export/output-layout'

/** Persisted CLI configuration. Mirrors the schema written by `recospec init`. */
export interface RecospecRc {
  /** Pinned framework — when set, `recospec add` skips auto-detection. */
  framework?: FrameworkId
  /** Default value for the `--bdd` flag. */
  bdd?: boolean
  /**
   * Output folders, relative to the project root. Each one that is set replaces the framework's
   * standard folder for page objects, specs or feature files.
   */
  paths?: OutputDirOverrides
  /** Schema version. We only ship `1` today but reserve the key for forward-compat. */
  version?: 1
}

export const RC_FILENAME = '.recospecrc.json'

export interface LoadedRc {
  config: RecospecRc
  /** Absolute path of the rc file the config was read from. */
  source: string
}

const PATH_KEYS = ['pagesDir', 'testsDir', 'featuresDir'] as const

/** Keep only the string folder settings we know; anything else in `paths` is a typo or noise. */
function withSanitizedPaths(rc: RecospecRc): RecospecRc {
  const { paths: raw, ...rest } = rc as RecospecRc & { paths?: unknown }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return rest
  const source = raw as Record<string, unknown>
  const paths: OutputDirOverrides = {}
  for (const key of PATH_KEYS) {
    const value = source[key]
    if (typeof value === 'string') paths[key] = value
  }
  return { ...rest, paths }
}

/** Read `.recospecrc.json` from `projectDir`, or `null` if missing/malformed. */
export function loadRc(projectDir: string): LoadedRc | null {
  const abs = resolve(projectDir, RC_FILENAME)
  if (!existsSync(abs)) return null
  try {
    const parsed = JSON.parse(readFileSync(abs, 'utf8')) as RecospecRc
    return { config: withSanitizedPaths(parsed), source: abs }
  } catch {
    // Malformed file — surface to the caller by returning null; caller logs.
    return null
  }
}

export const DEFAULT_RC: RecospecRc = {
  version: 1,
}
