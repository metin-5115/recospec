import type { FrameworkId } from '@shared/types/generated'

/** Folders (relative to the project root) a generated project keeps its files in. */
export interface OutputDirs {
  pages: string
  tests: string
  features: string
}

/** The `paths` block of `.recospecrc.json`; every folder is optional. */
export interface OutputDirOverrides {
  pagesDir?: string
  testsDir?: string
  featuresDir?: string
}

export const DEFAULT_OUTPUT_DIRS: Record<FrameworkId, OutputDirs> = {
  'playwright-ts': { pages: 'pages', tests: 'tests', features: 'features' },
  cypress: { pages: 'cypress/pages', tests: 'cypress/e2e', features: 'cypress/e2e' },
  'selenium-py': { pages: 'pages', tests: 'tests', features: 'features' },
  'selenium-java': {
    pages: 'src/main/java/pages',
    tests: 'src/test/java/tests',
    features: 'src/test/resources/features',
  },
}

/** Java source roots: the folder under them is the package, so it cannot be chosen freely. */
export const JAVA_MAIN_ROOT = 'src/main/java'
export const JAVA_TEST_ROOT = 'src/test/java'

/**
 * Folds `.`, `..` and empty segments of a relative path. `undefined` when nothing is left or the
 * path climbs above where it started. Pure string work: this module also ships in the extension,
 * where `node:path` does not exist.
 */
function collapseSegments(path: string): string | undefined {
  const kept: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (kept.pop() === undefined) return undefined
      continue
    }
    kept.push(segment)
  }
  return kept.length > 0 ? kept.join('/') : undefined
}

/** A project-relative folder with forward slashes and no `./` or trailing slash. */
export function normalizeOutputDir(dir: string): string {
  const unified = dir.trim().replace(/\\/g, '/')
  const isAbsolute = unified.startsWith('/') || /^[a-zA-Z]:/.test(unified)
  const normalized = isAbsolute ? undefined : collapseSegments(unified)
  if (!normalized) {
    throw new Error(
      `Invalid output folder "${dir}": it must be a relative folder inside the project.`,
    )
  }
  return normalized
}

function pick(configured: string | undefined, fallback: string): string {
  return configured?.trim() ? normalizeOutputDir(configured) : fallback
}

export function resolveOutputDirs(
  framework: FrameworkId | string,
  overrides: OutputDirOverrides = {},
): OutputDirs {
  const defaults =
    DEFAULT_OUTPUT_DIRS[framework as FrameworkId] ?? DEFAULT_OUTPUT_DIRS['playwright-ts']
  return {
    pages: pick(overrides.pagesDir, defaults.pages),
    tests: pick(overrides.testsDir, defaults.tests),
    features: pick(overrides.featuresDir, defaults.features),
  }
}

/** `import` specifier for `name` in `toDir`, written from a file that lives in `fromDir`. */
export function relativeModule(fromDir: string, toDir: string, name: string): string {
  const from = fromDir.split('/')
  const to = toDir.split('/')
  let shared = 0
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared++
  const climb = from.slice(shared).map(() => '..')
  const descend = to.slice(shared)
  const prefix = climb.length > 0 ? [...climb, ...descend] : ['.', ...descend]
  return `${prefix.join('/')}/${name}`
}

/** Python import path of a folder: `src/app/pages` → `src.app.pages`. */
export function dottedModule(dir: string): string {
  return dir.split('/').join('.')
}

/** Java package of a folder under `root`: `src/main/java/com/acme` → `com.acme`. */
export function javaPackage(dir: string, root: string): string {
  if (!dir.startsWith(`${root}/`)) {
    throw new Error(`Java output folders must live under ${root} (got "${dir}").`)
  }
  return dottedModule(dir.slice(root.length + 1))
}
