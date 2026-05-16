export type LocatorStrategyName =
  | 'testid'
  | 'test-attr'
  | 'aria-label'
  | 'aria-labelledby'
  | 'role-name'
  | 'label'
  | 'text'
  | 'id'
  | 'css'
  | 'xpath'

export interface LocatorFrameworkOutput {
  playwright?: string
  cypress?: string
  seleniumPy?: string
}

export interface Locator {
  strategy: LocatorStrategyName
  selector: string | Record<string, string>
  framework: LocatorFrameworkOutput
  warning?: string
}

export interface ScoredLocator extends Locator {
  score: number
  /**
   * Number of DOM elements this locator currently resolves to. 1 means unique.
   * Best-effort: for strategies whose `selector` is not a CSS selector
   * (`role-name`, sometimes `text`), defaults to 1.
   */
  matchCount: number
}

/** Describes that an element lives inside one or more open shadow roots. */
export interface ShadowContext {
  /** CSS selectors of each shadow host, outermost first. */
  hostChain: string[]
}

/** Describes that an element lives inside a (possibly nested) iframe. */
export interface FrameContext {
  frameUrl?: string
  frameName?: string
  frameTitle?: string
  /** Frame locator expressions (e.g. 'iframe[name="x"]'), outermost first. */
  frameChain: string[]
}

export type LocatorEdgeCaseKind = 'canvas' | 'hover-only' | 'portal'

export interface LocatorEdgeCase {
  kind: LocatorEdgeCaseKind
  message: string
}

export interface LocatorBundle {
  primary: ScoredLocator
  fallbacks: ScoredLocator[]
  rejected: ScoredLocator[]
  /**
   * All scored candidates produced by the engine (one per strategy that fired),
   * sorted by score descending. Includes primary, fallbacks, and rejected.
   * Surfaced for UIs that want to inspect every option the engine considered.
   */
  allCandidates: ScoredLocator[]
  /** Present when the element lives inside an open shadow root. */
  shadowContext?: ShadowContext
  /** Set to true when a closed shadow root was encountered (locator may be unreliable). */
  shadowClosed?: boolean
  /** Present when the element lives inside an iframe. */
  frameContext?: FrameContext
  /** Detected DOM-level edge cases (canvas, portal, hover-only) — guidance for codegen. */
  edgeCases?: LocatorEdgeCase[]
}
