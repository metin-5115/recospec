import type {
  Locator,
  LocatorBundle,
  RejectedCandidate,
  ScoredLocator,
  ShadowContext,
  FrameContext,
} from '@shared/types/locator'
import { TestIdStrategy } from './strategies/testid'
import { TestAttributesStrategy } from './strategies/test-attributes'
import { AriaLabelStrategy } from './strategies/aria-label'
import { RoleNameStrategy } from './strategies/role-name'
import { LabelStrategy } from './strategies/label'
import { TextStrategy } from './strategies/text'
import { IdStrategy } from './strategies/id'
import { CssStrategy } from './strategies/css'
import { XPathStrategy } from './strategies/xpath'
import { buildComposedCandidate } from './strategies/composed'
import { buildTemplateCandidate } from './strategies/template'
import {
  PlaceholderStrategy,
  AltStrategy,
  TitleStrategy,
  NameAttributeStrategy,
  HrefStrategy,
} from './strategies/attribute-strategies'
import { classifyText } from '@shared/text-classifier'
import { extractFeatures } from './pipeline/features'
import { scoreFeatures } from './pipeline/weights'
import { resolveLocator } from './pipeline/resolve'
import { scopeDocumentTo } from './pipeline/scope'
import { applyConstraints, validateBundleMember } from './pipeline/constraints'
import type { ResolvedCandidate } from './pipeline/constraints'
import { buildFingerprint } from './pipeline/fingerprint'
import type { LocatorStrategy } from './strategies/base'
import { detectEdgeCases, isCanvasLikeElement } from './edge-cases'
import {
  LOCATOR_WEAK_SCORE_THRESHOLD,
  XPATH_GATE_MIN_HEALTHY_SURVIVORS,
  XPATH_GATE_PRIMARY_SAFE_SCORE,
} from '@shared/constants'

export interface EvaluateOptions {
  shadowContext?: ShadowContext
  shadowClosed?: boolean
  frameContext?: FrameContext
  /** Live viewport size — feeds the fingerprint's boundingBoxRatio. */
  viewport?: { width: number; height: number }
  /** Event composedPath — lets the composed anchor search cross shadow roots. */
  composedPath?: readonly EventTarget[]
  /** The element's text changed during the recording session (MutationObserver). */
  mutatedText?: boolean
}

/** @deprecated superseded by EvaluateOptions; kept for source compatibility. */
export type ShadowOptions = EvaluateOptions

/**
 * Passed-candidate score below which the engine attempts a composed
 * (anchor + target) candidate — flat survivors that are positional or
 * class/tag-only deserve a structured alternative.
 */
const COMPOSED_TRIGGER_SCORE = 50

function buildCanvasLocator(el: Element, doc: Document): ScoredLocator {
  const tag = el.tagName.toLowerCase()
  const selector = el.id ? `${tag}#${el.id}` : tag
  let matchCount = 1
  try {
    matchCount = doc.querySelectorAll(selector).length
  } catch {
    /* keep default */
  }
  return {
    strategy: 'css',
    selector,
    score: 0,
    matchCount,
    warning: 'manual-coordinate-required',
    framework: {
      playwright: `page.locator(${JSON.stringify(selector)})`,
      cypress: `cy.get(${JSON.stringify(selector)})`,
      seleniumPy: `driver.find_element(By.CSS_SELECTOR, ${JSON.stringify(selector)})`,
    },
  }
}

function selectorKey(loc: Locator): string {
  return typeof loc.selector === 'string' ? loc.selector : JSON.stringify(loc.selector)
}

/** A flat survivor good enough to carry a bundle slot: not weak, not positional. */
function isHealthySurvivor(loc: ScoredLocator): boolean {
  return (
    loc.score >= LOCATOR_WEAK_SCORE_THRESHOLD &&
    loc.features?.hasPositionalIndex !== true &&
    loc.warning !== 'absolute-xpath'
  )
}

/**
 * The XPath candidate is the costliest to build and resolve, and it is the
 * last-resort strategy. Skip it once the flat survivors already give a strong
 * primary and a healthy second option; otherwise (too few healthy survivors,
 * or the best one is weak enough for an attribute XPath to outrank it) keep it.
 */
function needsXPath(passed: readonly ScoredLocator[]): boolean {
  const healthy = passed.filter(isHealthySurvivor)
  if (new Set(healthy.map(selectorKey)).size < XPATH_GATE_MIN_HEALTHY_SURVIVORS) return true
  const best = healthy.reduce((max, c) => Math.max(max, c.score), 0)
  return best < XPATH_GATE_PRIMARY_SAFE_SCORE
}

function scoreCandidate(loc: Locator, matches: Element[]): ScoredLocator {
  const features = extractFeatures(loc)
  return {
    ...loc,
    features,
    score: scoreFeatures(features),
    matchCount: matches.length,
  }
}

/** The human text a candidate keys on, for classification. Null = not text-keyed. */
function keyTextOf(loc: Locator): string | null {
  const sel = typeof loc.selector === 'string' ? loc.selector : ''
  switch (loc.strategy) {
    case 'text':
    case 'label':
      return sel
    case 'role-name': {
      const m = sel.match(/^[\w-]+\[name="([\s\S]*)"\]$/)
      return m ? m[1] : null
    }
    case 'aria-label':
    case 'aria-labelledby': {
      const m = sel.match(/^\[aria-label="([\s\S]*)"\]$/)
      return m ? m[1] : null
    }
    default:
      return null
  }
}

/**
 * Count same-shaped siblings (tag + sorted class set + child count) whose text
 * DIFFERS from the element's — the structural-template signal that catches
 * calendar days, product cards and option lists in any language.
 */
function countTemplateSiblings(el: Element): number {
  const parent = el.parentElement
  if (!parent) return 0
  const classes = [...el.classList].sort().join(' ')
  const ownText = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  let count = 0
  for (const sibling of Array.from(parent.children)) {
    if (sibling === el) continue
    if (sibling.tagName !== el.tagName) continue
    if ([...sibling.classList].sort().join(' ') !== classes) continue
    if (sibling.childElementCount !== el.childElementCount) continue
    const text = (sibling.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text && text !== ownText) count++
  }
  return count
}

/**
 * Bundle fallbacks prefer strategy DIVERSITY: a primary that breaks usually
 * breaks for a strategy-specific reason, so the best two candidates from
 * OTHER strategies give self-healing a real second chance. Remaining slots
 * fill from same-strategy survivors when diversity runs out.
 */
function pickFallbacks(sorted: ScoredLocator[], primary: ScoredLocator): ScoredLocator[] {
  const fallbacks: ScoredLocator[] = []
  const usedStrategies = new Set([primary.strategy])
  for (const candidate of sorted) {
    if (fallbacks.length >= 2) break
    if (candidate === primary) continue
    if (usedStrategies.has(candidate.strategy)) continue
    fallbacks.push(candidate)
    usedStrategies.add(candidate.strategy)
  }
  for (const candidate of sorted) {
    if (fallbacks.length >= 2) break
    if (candidate === primary || fallbacks.includes(candidate)) continue
    fallbacks.push(candidate)
  }
  return fallbacks
}

export class LocatorEngine {
  private readonly strategies: LocatorStrategy[] = [
    new TestIdStrategy(),
    new TestAttributesStrategy(),
    new AriaLabelStrategy(),
    new RoleNameStrategy(),
    new LabelStrategy(),
    new PlaceholderStrategy(),
    new AltStrategy(),
    new TitleStrategy(),
    new TextStrategy(),
    new IdStrategy(),
    new NameAttributeStrategy(),
    new HrefStrategy(),
    new CssStrategy(),
  ]

  /** Evaluated only when `needsXPath` opens the gate. */
  private readonly xpathStrategy = new XPathStrategy()

  /**
   * Three-stage pipeline:
   *   A) hard-constraint filter (uniqueness · renderability · no raw volatile)
   *   B) feature-vector scoring of the survivors (weights.ts)
   *   C) bundle production — primary + diverse fallbacks + fingerprint +
   *      reasoned diagnostics, post-validated against the snapshot.
   */
  evaluate(element: Element, rootDoc: Document, options?: EvaluateOptions): LocatorBundle | null {
    // An element inside a shadow root must be judged against ITS root — the
    // document's own queries cannot see it (see pipeline/scope.ts).
    const doc = scopeDocumentTo(element, rootDoc)
    const edgeCases = detectEdgeCases(element, doc)

    if (isCanvasLikeElement(element)) {
      const synthetic = buildCanvasLocator(element, doc)
      return {
        primary: synthetic,
        fallbacks: [],
        rejected: [],
        allCandidates: [synthetic],
        diagnostics: [],
        fingerprint: buildFingerprint(element, doc, { viewport: options?.viewport }),
        shadowContext: options?.shadowContext,
        shadowClosed: options?.shadowClosed,
        frameContext: options?.frameContext,
        edgeCases,
      }
    }

    // Classification context shared by every text-keyed candidate. Computed
    // once per element — sibling shape and mutation state are element facts,
    // not per-strategy facts.
    const classifyCtx = {
      role: element.getAttribute('role'),
      siblingTemplateCount: countTemplateSiblings(element),
      mutated: options?.mutatedText,
      locale: doc.documentElement.lang || undefined,
    }

    // Resolve + score every flat candidate exactly once; the resolution map is
    // reused by both the constraint filter and post-production validation so
    // no candidate is ever resolved twice against the same snapshot.
    const resolutionOf = new Map<ScoredLocator, Element[]>()
    const resolved: ResolvedCandidate[] = []
    for (const strategy of this.strategies) {
      const locator = strategy.evaluate(element, doc)
      if (!locator) continue
      // The full multi-signal classifier overrides the strategies' own cheap
      // volatile hint — it sees sibling templates, observed mutation and the
      // role context the strategies cannot.
      const keyText = keyTextOf(locator)
      if (keyText !== null) {
        locator.volatile = classifyText(keyText, classifyCtx) !== 'stable-label'
      }
      const matches = resolveLocator(locator, doc)
      const candidate = scoreCandidate(locator, matches)
      resolutionOf.set(candidate, matches)
      resolved.push({ candidate, matches })
    }

    // Stage A — hard constraints.
    let { passed, diagnostics } = applyConstraints(resolved, element)

    if (needsXPath(passed)) {
      const locator = this.xpathStrategy.evaluate(element, doc)
      if (locator) {
        const matches = resolveLocator(locator, doc)
        const candidate = scoreCandidate(locator, matches)
        resolutionOf.set(candidate, matches)
        resolved.push({ candidate, matches })
        const result = applyConstraints([{ candidate, matches }], element)
        passed = [...passed, ...result.passed]
        diagnostics = [...diagnostics, ...result.diagnostics]
      }
    }

    // Structured production: when no flat survivor is healthy, try a template
    // (parameterized data value — the date/data answer) and a composed
    // (anchor + target) chain before settling for a positional path. Both go
    // through the same constraint gate; stage B ranks whatever survives.
    const bestPassed = passed.reduce((max, c) => Math.max(max, c.score), 0)
    // Also fire structured production when the ONLY survivors are positional
    // (absolute / nth-indexed) — those are unique-by-construction so they pass
    // constraints and would otherwise become a silent score-0 primary.
    const onlyPositionalSurvives =
      passed.length > 0 &&
      passed.every((c) => c.features?.hasPositionalIndex === true || c.warning === 'absolute-xpath')
    if (passed.length === 0 || bestPassed < COMPOSED_TRIGGER_SCORE || onlyPositionalSurvives) {
      const structured = [
        buildTemplateCandidate(element, doc, {
          composedPath: options?.composedPath,
          mutated: options?.mutatedText,
        }),
        buildComposedCandidate(element, doc, {
          composedPath: options?.composedPath,
        }),
      ]
      for (const produced of structured) {
        if (!produced) continue
        const matches = resolveLocator(produced, doc)
        const candidate = scoreCandidate(produced, matches)
        resolutionOf.set(candidate, matches)
        const result = applyConstraints([{ candidate, matches }], element)
        passed = [...passed, ...result.passed]
        diagnostics = [...diagnostics, ...result.diagnostics]
      }
    }

    const rejectedLocators = resolved.map((r) => r.candidate).filter((c) => !passed.includes(c))

    if (passed.length === 0) {
      // Theoretical: the XPath strategy's full positional path is unique by
      // construction, so an element with zero valid candidates implies a
      // detached/exotic node. Match the legacy "no candidates" contract.
      return null
    }

    // Stage B — rank survivors by feature score.
    const sorted = [...passed].sort((a, b) => b.score - a.score)

    // Stage C — bundle + post-production validation. Cached resolutions are
    // authoritative (computed against this very snapshot); re-resolution only
    // runs for candidates that somehow lack a cache entry.
    const validated: ScoredLocator[] = []
    const validationDiagnostics: RejectedCandidate[] = []
    for (const candidate of sorted) {
      const cached = resolutionOf.get(candidate)
      const valid = cached
        ? cached.length === 1 && cached[0] === element
        : validateBundleMember(candidate, element, doc)
      if (valid) {
        validated.push(candidate)
      } else {
        validationDiagnostics.push({
          strategy: candidate.strategy,
          selector:
            typeof candidate.selector === 'string'
              ? candidate.selector
              : JSON.stringify(candidate.selector),
          reason: 'validation-failed',
          detail: 'post-production re-resolution did not return exactly the recorded element',
          score: candidate.score,
        })
      }
    }
    if (validated.length === 0) return null

    const primary = validated[0]
    const fallbacks = pickFallbacks(validated, primary)
    const allCandidates = [...validated, ...rejectedLocators].sort((a, b) => b.score - a.score)

    return {
      primary,
      fallbacks,
      rejected: rejectedLocators,
      allCandidates,
      diagnostics: [...diagnostics, ...validationDiagnostics],
      fingerprint: buildFingerprint(element, doc, { viewport: options?.viewport }),
      shadowContext: options?.shadowContext,
      shadowClosed: options?.shadowClosed,
      frameContext: options?.frameContext,
      ...(edgeCases.length > 0 && { edgeCases }),
    }
  }
}
