import type { OutputSelection } from './generated'

/**
 * Everything a code-generation request can ask for. One type for every caller — the side panel,
 * the background worker, the CLI and the VS Code extension — so an option added here reaches all
 * of them.
 */

/**
 * How a template (parameterized data-value) locator is rendered:
 *  - `param`    — page-object accessor takes the value as a method parameter (default)
 *  - `relative` — date templates re-compute the value relative to the run day
 *  - `fixed`    — freeze the value recorded at capture time (legacy behaviour)
 */
export type TemplateParamMode = 'param' | 'relative' | 'fixed'

/** How a container-anchored element is rendered: the row label hardcoded, or a method parameter. */
export type ComposedParamMode = 'scoped' | 'param'

/** A single user-visible test data parameter surfaced in the side panel. */
export interface TestDataParam {
  /** Stable parameter id: the IR element name, or `<element name>#<variant>` for another value. */
  key: string
  /** Camel-case parameter name as rendered in the method signature. */
  name: string
  /** Detected (or user-overridden) sensitive flag. */
  isSecret: boolean
  /** Default value substituted at call sites when no env var is set. */
  defaultValue: string
  /** When true, adapters emit `process.env.X ?? default` style lookups. */
  useEnvVar: boolean
  /** SCREAMING_SNAKE_CASE env var name (with the `RECOSPEC_` prefix). */
  envVarName: string
  /**
   * Set on a parameter for a different value typed into the same field (`RECOSPEC_PASSWORD_INVALID`):
   * the key of the field's regular parameter. The value itself is only kept as a fingerprint.
   */
  baseKey?: string
  /** Fingerprint of the recorded value this variant stands for (see `valueFingerprint`). */
  valueFingerprint?: string
}

/** Full test data configuration shipped from the side panel into codegen. */
export interface TestDataConfig {
  params: TestDataParam[]
}

/** The `paths` block of `.recospecrc.json`; every folder is optional. */
export interface OutputDirOverrides {
  pagesDir?: string
  testsDir?: string
  featuresDir?: string
}

export interface GenerateOptions {
  /** Emit `page.route(...)` mocks for any captured network actions. */
  includeMocks?: boolean
  /**
   * Append a "the flow ended on this URL" assertion to a recording the user never asserted on.
   * Defaults to `true`.
   */
  finalStateAssertion?: boolean
  /**
   * Let the recorded fallback locators take over at run time (Playwright / Cypress only; the
   * Selenium adapters list them as suggestions). Defaults to `true`.
   */
  selfHealing?: boolean
  /** Map of `${pageClassName}.${inferredName}` → user-chosen name. */
  methodRenames?: Record<string, string>
  /**
   * When `false`, auto-detected `wait` steps are stripped from the recording before code
   * generation. Defaults to `true`.
   */
  autoWaitEnabled?: boolean
  /**
   * User-edited test data config — drives env-var emission for sensitive fields and which
   * fixture/.env scaffolds adapters render.
   */
  testData?: TestDataConfig
  /** Emit Gherkin `.feature` + step definitions alongside the page objects. */
  bdd?: boolean
  /**
   * Which file groups to emit. Defaults to all (page objects + test + scaffold). An unselected
   * group is never rendered.
   */
  selection?: Partial<OutputSelection>
  /** Per-template rendering modes keyed by the element's `locatorValue`. Default: `param`. */
  templateModes?: Record<string, TemplateParamMode>
  /** Per-element container-anchor modes keyed by `locatorValue`. Default: `scoped`. */
  composedModes?: Record<string, ComposedParamMode>
  /** Folders the files will be written to when they differ from the framework's standard layout. */
  dirs?: OutputDirOverrides
}
