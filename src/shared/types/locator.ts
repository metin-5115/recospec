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
  | 'composed'
  | 'template'
  | 'placeholder'
  | 'alt'
  | 'title'
  | 'name'
  | 'href'
  | 'layout'

/**
 * Spatial last-resort locator (Playwright `:near()`/`:right-of()`, Selenium 4
 * relative locators). Cypress has no equivalent → renders unsupported. Produced
 * only when no attribute / text / structural candidate survives; requires
 * runtime geometry, so it is enriched at capture time rather than in jsdom.
 */
export interface LayoutSpec {
  relation: 'near' | 'right-of' | 'left-of' | 'above' | 'below'
  /** The target element's own tag/role, narrowed spatially against the anchor. */
  target: { tag: string; role?: string }
  /** A stable anchor the target sits next to (its accessible name + role/css). */
  anchor: { role?: string; name?: string; css: string }
}

/**
 * Parameterized locator produced when the only usable identity for an element
 * is a DATA VALUE (a date cell's accessible name, a row keyed by a price or
 * an entity name). The raw value never lands in the generated locator —
 * codegen renders a parameterized page-object method instead, and
 * `capturedValue` only seeds test data / fixed-mode call sites.
 */
export interface TemplateSpec {
  /** Which query shape the template instantiates at runtime. */
  strategy: 'role-name' | 'text' | 'aria-label'
  role?: string
  /** `{date:<date-fns pattern>:<locale>}` or `{param:<name>}`. */
  nameTemplate: string
  /** The raw value observed at record time. */
  capturedValue: string
  /** Canonical form — ISO-8601 (`yyyy-MM-dd`) when `kind === 'date'`. */
  capturedNormalized?: string
  kind: 'date' | 'param'
  /** date-fns format pattern when `kind === 'date'`. */
  pattern?: string
  /** Locale id (`tr` / `en-US` / `en-GB` / `de`) when `kind === 'date'`. */
  localeId?: string
  /** Stable anchor scope when one exists above the element (xpath drives Selenium renderers). */
  scope?: ComposedSpec['anchor'] & { xpath: string }
  /** Captured-value-instantiated single-expression XPath (Selenium renderers). */
  xpath: string
}

/**
 * Anchor + target chain produced by the `composed` strategy when no flat
 * candidate uniquely identifies the element. The anchor is a stable, unique
 * scope (testid holder / semantic role container); the target is resolved
 * within that scope, optionally narrowed by a content filter and — as a last
 * resort — a positional index.
 */
export interface ComposedSpec {
  anchor: {
    /** How the anchor was identified — drives idiomatic per-framework rendering.
     * `container` = a repeated row/card disambiguated by `filterText`/`nthIndex`. */
    kind: 'testid' | 'role' | 'tag' | 'container'
    /** The testid value, role name, tag name, or (for container) the disambiguating label. */
    value: string
    /** CSS selector for the anchor — document-unique except for `container` kind. */
    css: string
    /** Stable descendant text that disambiguates a repeated container (hasText/substring). */
    filterText?: string
    /** Positional index among same-css containers — FRAGILE last resort. */
    nthIndex?: number
  }
  target: {
    tag: string
    role?: string
    /** Accessible name — only set when classified stable (never a raw data value). */
    name?: string
    css?: string
  }
  /** Stable visible-text narrowing filter (uniquification ladder step b). */
  filterText?: string
  /** Positional index within the scope — genuine last resort (ladder step c). */
  nthIndex?: number
  /**
   * Precomputed single-expression XPath equivalent, so Selenium renderers can
   * emit one `By.xpath(...)` without re-deriving DOM context at codegen time.
   */
  xpath: string
}

/** Why a candidate was excluded from the bundle by the constraint filter. */
export type RejectionReason =
  | 'not-unique'
  | 'not-renderable'
  | 'volatile-raw-value'
  | 'validation-failed'

/**
 * Diagnostic record for a candidate that failed the hard-constraint filter.
 * Deliberately lightweight (no framework strings) — it is persisted with every
 * recorded step and surfaced in the locator detail UI.
 */
export interface RejectedCandidate {
  strategy: LocatorStrategyName
  selector: string
  reason: RejectionReason
  /** Human-readable specifics, e.g. `matched 30 elements`. */
  detail?: string
  score?: number
}

/**
 * Structural identity captured at record time — the raw material for
 * self-healing when every locator in the bundle later fails. Attribute values
 * classified as dynamic data are masked so the fingerprint stays stable.
 */
export interface ElementFingerprint {
  tag: string
  attributes: Record<string, string>
  role: string | null
  accessibleName: string | null
  /** Visible text of adjacent siblings + nearest ancestor heading. */
  neighborTexts: string[]
  /** Tag-only ancestor path from body, no positional indices. */
  domPath: string
  /** Element centre as a viewport-relative ratio (0..1). {0,0} when layout is unavailable (jsdom). */
  boundingBoxRatio: { x: number; y: number }
}

/**
 * Concrete-selector feature vector scored by `pipeline/weights.ts`. Strategy
 * identity is deliberately absent — candidates are judged by what the selector
 * actually relies on, not by which strategy produced it.
 */
export interface LocatorFeatures {
  /** 3: testid/test-attr · 2: aria/role/name · 1: id/href/placeholder/alt/title/name-attr · 0: class/tag. */
  attrTier: 0 | 1 | 2 | 3
  /** The human text the locator keys on is classified as a data value. */
  textIsData: boolean
  /** Max Shannon entropy across class names used by the selector (0 when none). */
  classEntropy: number
  /** Combinator / path-step count. */
  depth: number
  /** Uses :nth-*, [N], or .nth(i). */
  hasPositionalIndex: boolean
  isComposed: boolean
  /** Anchor's attrTier when composed, else 0. */
  anchorTier: 0 | 1 | 2 | 3
  /** Keys on visible text / accessible name (breaks under i18n/copy changes). */
  localeDependent: boolean
}

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
  /**
   * True when the human text this locator keys on (visible text / accessible
   * name / label) is a dynamic value — a price, number, date, time, or
   * percentage. The constraint filter rejects such candidates from the bundle
   * (volatile raw values never get embedded in generated locators). Set by the
   * text-based strategies.
   */
  volatile?: boolean
  /** Structured anchor + target chain — present when strategy === 'composed'. */
  composed?: ComposedSpec
  /** Parameterized template — present when strategy === 'template'. */
  template?: TemplateSpec
  /** Spatial relation spec — present when strategy === 'layout'. */
  layout?: LayoutSpec
}

export interface ScoredLocator extends Locator {
  score: number
  /**
   * Number of elements this locator resolves to in the record-time DOM
   * snapshot, counted strategy-aware (accessible-name strategies count only
   * a11y-visible elements; CSS strategies count the whole DOM). 1 = unique.
   */
  matchCount: number
  /** Feature vector the score was derived from — kept for diagnostics/calibration. */
  features?: LocatorFeatures
}

/** Describes that an element lives inside one or more open shadow roots. */
export interface ShadowContext {
  /** CSS selectors of each shadow host, outermost first. */
  hostChain: string[]
  /**
   * True when a host in the chain was originally a CLOSED shadow root that the
   * opt-in MAIN-world proxy coerced open. Drives the "closed-shadow pierced"
   * badge and a caveat comment in the generated code.
   */
  pierced?: boolean
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
  /** Reasoned record of every candidate the constraint filter excluded. */
  diagnostics?: RejectedCandidate[]
  /** Structural identity captured at record time — self-healing raw material. */
  fingerprint?: ElementFingerprint
  /** Present when the element lives inside an open shadow root. */
  shadowContext?: ShadowContext
  /** Set to true when a closed shadow root was encountered (locator may be unreliable). */
  shadowClosed?: boolean
  /** Present when the element lives inside an iframe. */
  frameContext?: FrameContext
  /** Detected DOM-level edge cases (canvas, portal, hover-only) — guidance for codegen. */
  edgeCases?: LocatorEdgeCase[]
}
