export type FrameworkId = 'playwright-ts' | 'cypress' | 'selenium-py' | 'selenium-java'

export interface GeneratedFile {
  filename: string
  content: string
}

export interface GeneratedCode {
  framework: FrameworkId
  files: GeneratedFile[]
}

/**
 * Which groups of files a generation run should emit. Each flag maps to one of
 * the adapter's separate render methods, so an unselected group is never
 * rendered (not rendered-then-filtered):
 * - `pageObjects` → `renderPageObject`
 * - `test`        → `renderScenario` (or the BDD feature + step files)
 * - `scaffold`    → `renderScaffold` (project config, package.json/pom.xml, …)
 *
 * BDD is a flavour of `test` driven by the separate `bdd` option, not a fourth
 * group.
 */
export interface OutputSelection {
  pageObjects: boolean
  test: boolean
  scaffold: boolean
}

export const DEFAULT_OUTPUT_SELECTION: OutputSelection = {
  pageObjects: true,
  test: true,
  scaffold: true,
}

/** Fill a partial selection with defaults (full output). */
export function normalizeSelection(selection?: Partial<OutputSelection>): OutputSelection {
  return { ...DEFAULT_OUTPUT_SELECTION, ...selection }
}

/** True when a selection would emit no files at all. */
export function isEmptySelection(selection: OutputSelection): boolean {
  return !selection.pageObjects && !selection.test && !selection.scaffold
}

/**
 * Where a generated Claude Code prompt is written. Relocated here (a pure type
 * with no runtime) so the side panel can reference it without importing the
 * codegen prompt-export module.
 */
export type PromptMode = 'slash' | 'claude-md' | 'prompt'

/** Serialisation of the compact LLM context export. */
export type LlmContextFormat = 'compact' | 'json'

/** What the LLM context is for: writing test code, repairing locators, or both. */
export type LlmContextTask = 'codegen' | 'heal' | 'both'
