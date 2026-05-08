import type {
  LocatorBundle,
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
import { score } from './scoring/stability-scorer'
import { LocatorSelector } from './selector'
import type { LocatorStrategy } from './strategies/base'
import { detectEdgeCases, isCanvasLikeElement } from './edge-cases'

export interface ShadowOptions {
  shadowContext?: ShadowContext
  shadowClosed?: boolean
  frameContext?: FrameContext
}

function buildCanvasLocator(el: Element): ScoredLocator {
  const tag = el.tagName.toLowerCase()
  const selector = el.id ? `${tag}#${el.id}` : tag
  return {
    strategy: 'css',
    selector,
    score: 0,
    warning: 'manual-coordinate-required',
    framework: {
      playwright: `page.locator(${JSON.stringify(selector)})`,
      cypress: `cy.get(${JSON.stringify(selector)})`,
      seleniumPy: `driver.find_element(By.CSS_SELECTOR, ${JSON.stringify(selector)})`,
    },
  }
}

export class LocatorEngine {
  private readonly strategies: LocatorStrategy[] = [
    new TestIdStrategy(),
    new TestAttributesStrategy(),
    new AriaLabelStrategy(),
    new RoleNameStrategy(),
    new LabelStrategy(),
    new TextStrategy(),
    new IdStrategy(),
    new CssStrategy(),
    new XPathStrategy(),
  ]

  private readonly selector = new LocatorSelector()

  evaluate(element: Element, doc: Document, options?: ShadowOptions): LocatorBundle | null {
    const edgeCases = detectEdgeCases(element, doc)

    if (isCanvasLikeElement(element)) {
      const synthetic = buildCanvasLocator(element)
      return {
        primary: synthetic,
        fallbacks: [],
        rejected: [],
        shadowContext: options?.shadowContext,
        shadowClosed: options?.shadowClosed,
        frameContext: options?.frameContext,
        edgeCases,
      }
    }

    const candidates: ScoredLocator[] = []

    for (const strategy of this.strategies) {
      const locator = strategy.evaluate(element, doc)
      if (locator) {
        candidates.push({ ...locator, score: score(locator, element, doc) })
      }
    }

    if (candidates.length === 0) return null
    const bundle = this.selector.select(candidates)
    return {
      ...bundle,
      shadowContext: options?.shadowContext,
      shadowClosed: options?.shadowClosed,
      frameContext: options?.frameContext,
      ...(edgeCases.length > 0 && { edgeCases }),
    }
  }
}
