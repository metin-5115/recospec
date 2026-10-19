import type { IRPage, IRScenario, TestDataConfig } from '../ir/types'
import type { FrameworkId, GeneratedFile } from '@shared/types/generated'
import type { OutputDirOverrides } from '../export/output-layout'

export interface AdapterMetadata {
  language: string
  testRunner: string
  packageName: string
}

/**
 * Render-time options forwarded by the orchestrator (e.g. include mocks).
 * Every render method takes them as an explicit trailing argument, so a render
 * is a pure function of its inputs — adapters hold no per-call state.
 */
export interface RenderOptions {
  includeMocks?: boolean
  /**
   * Wire the recorded fallback locators into the generated code, so they take over at run time
   * when the primary one breaks (Playwright `selfHealingLocator`, Cypress `cy.selfHealing`).
   * Off when omitted; the Selenium adapters have no runtime helper and only list suggestions.
   */
  selfHealing?: boolean
  /**
   * User-edited test-data config. Adapters use this to render env-var
   * lookups for sensitive fields and `.env.example` / fixture scaffolds.
   */
  testData?: TestDataConfig
  /** Emit Gherkin .feature + step definitions instead of a vanilla spec. */
  bdd?: boolean
  /**
   * Slug of the recorded flow (see `flowSlug`). Scaffold files that live next to the spec —
   * Playwright's `<slug>.spec.ts-snapshots/` — need it; defaults to the generic name.
   */
  flowSlug?: string
  /**
   * Origin the flow was recorded on. Scaffold config (Playwright `baseURL`, Cypress `baseUrl`,
   * pytest `BASE_URL`) defaults to it; specs and page objects use routes relative to it.
   */
  baseUrl?: string
  /**
   * The flow uploads files. Scaffolds then add the `fixtures/` folder the generated upload
   * steps read from.
   */
  hasUploads?: boolean
  /**
   * Folders the files will be written to when they differ from the framework's standard layout
   * (the CLI's `paths` setting). Generated imports and package names are computed from them.
   */
  dirs?: OutputDirOverrides
}

export interface FrameworkAdapter {
  readonly id: FrameworkId
  readonly displayName: string
  readonly fileExtension: string
  readonly metadata: AdapterMetadata

  renderPageObject(page: IRPage, options?: RenderOptions): GeneratedFile
  renderScenario(scenario: IRScenario, options?: RenderOptions): GeneratedFile
  renderScaffold(options?: RenderOptions): GeneratedFile[]
  postProcess?(files: GeneratedFile[], options?: RenderOptions): GeneratedFile[]

  /** BDD mode — Gherkin feature file (`*.feature`). Adapters that support BDD implement all three. */
  renderBddFeature?(scenario: IRScenario, options?: RenderOptions): GeneratedFile
  /** BDD mode — step definitions wired to the page-object methods (`*.steps.ts`). */
  renderBddSteps?(scenario: IRScenario, options?: RenderOptions): GeneratedFile
  /** BDD mode — scaffold additions (config, deps). Merged with `renderScaffold()`. */
  renderBddScaffold?(options?: RenderOptions): GeneratedFile[]
}

export const ADAPTER_REGISTRY: Record<FrameworkId, FrameworkAdapter | undefined> = {
  'playwright-ts': undefined,
  cypress: undefined,
  'selenium-py': undefined,
  'selenium-java': undefined,
}

export function registerAdapter(adapter: FrameworkAdapter): void {
  ADAPTER_REGISTRY[adapter.id] = adapter
}

export function getAdapter(id: FrameworkId): FrameworkAdapter {
  const adapter = ADAPTER_REGISTRY[id]
  if (!adapter) {
    throw new Error(`No adapter registered for framework: ${id}`)
  }
  return adapter
}

export function listAdapters(): FrameworkAdapter[] {
  return Object.values(ADAPTER_REGISTRY).filter((a): a is FrameworkAdapter => Boolean(a))
}
