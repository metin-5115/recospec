import type { IRPage, IRScenario, TestDataConfig } from '../ir/types'
import type { FrameworkId, GeneratedFile } from '@shared/types/generated'

export interface AdapterMetadata {
  language: string
  testRunner: string
  packageName: string
}

/** Render-time options forwarded by the orchestrator (e.g. include mocks). */
export interface RenderOptions {
  includeMocks?: boolean
  /**
   * User-edited test-data config. Adapters use this to render env-var
   * lookups for sensitive fields and `.env.example` / fixture scaffolds.
   */
  testData?: TestDataConfig
  /** Emit Gherkin .feature + step definitions instead of a vanilla spec. */
  bdd?: boolean
}

export interface FrameworkAdapter {
  readonly id: FrameworkId
  readonly displayName: string
  readonly fileExtension: string
  readonly metadata: AdapterMetadata

  renderPageObject(page: IRPage): GeneratedFile
  renderScenario(scenario: IRScenario): GeneratedFile
  renderScaffold(): GeneratedFile[]
  postProcess?(files: GeneratedFile[]): GeneratedFile[]
  /** Optional hook invoked once before rendering — adapters use this to read flags like `includeMocks`. */
  applyOptions?(options: RenderOptions): void

  /** BDD mode — Gherkin feature file (`*.feature`). Adapters that support BDD implement all three. */
  renderBddFeature?(scenario: IRScenario): GeneratedFile
  /** BDD mode — step definitions wired to the page-object methods (`*.steps.ts`). */
  renderBddSteps?(scenario: IRScenario): GeneratedFile
  /** BDD mode — scaffold additions (config, deps). Merged with `renderScaffold()`. */
  renderBddScaffold?(): GeneratedFile[]
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
