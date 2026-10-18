import type {
  InferredMethod,
  IRElement,
  IRPage,
  IRParamType,
  IRScenario,
  IRStep,
} from '../ir/types'
import { NAVIGABLE_URL_PATTERN } from '@shared/constants'

/**
 * Framework-neutral description of a generated test body: which page-object method to call, in
 * which order, with which recorded values. Adapters only decide how each item is spelled.
 */

/** One argument of a page-object method call. */
export interface FlowArg {
  type: IRParamType
  /** Recorded value as text; booleans are `'true'`/`'false'`. */
  value: string
  /** The fill target — lets adapters swap a sensitive value for an environment lookup. */
  element?: IRElement
  /** True when the value was typed into `element`. */
  fromFill: boolean
  /** Calendar date (`yyyy-MM-dd`) behind a `date` argument, when the recording captured one. */
  isoDate?: string
}

export type FlowItem =
  /** A navigation the page-object methods do not include (a lone `navigate` step). */
  | { kind: 'visit'; page: IRPage; url: string }
  | { kind: 'call'; page: IRPage; method: InferredMethod; args: FlowArg[] }
  /** The page has no inferred methods, so its steps are written out where they happen. */
  | { kind: 'inline'; page: IRPage }

const SLUG_SUFFIX = /Input$|Button$|Btn$|Link$|Select$|Field$|Box$|Toggle$|Checkbox$|Radio$/

/** Parameter name the method inferer derives from an element: `promoCodeInput` → `promoCode`. */
function paramSlug(elementName: string): string {
  const stripped = elementName.replace(SLUG_SUFFIX, '')
  return stripped.charAt(0).toLowerCase() + stripped.slice(1)
}

function isContainerParam(el: IRElement): boolean {
  return (
    el.locatorStrategy === 'composed' &&
    el.composed?.anchor.kind === 'container' &&
    el.composedParamMode === 'param' &&
    Boolean(el.composed.anchor.filterText)
  )
}

function labelOf(el: IRElement): string {
  return el.elementSnapshot?.textContent?.trim() || el.name
}

/** Fallback for a parameter no step feeds (patterns that name a parameter but never use it). */
function defaultArg(param: string, type: IRParamType, steps: IRStep[]): FlowArg {
  if (type === 'boolean') return { type, value: 'true', fromFill: false }
  if (type === 'number') return { type, value: '0', fromFill: false }
  const source = steps.find((s) => s.element && paramSlug(s.element.name) === param)?.element
  return { type, value: source ? labelOf(source) : param, fromFill: false }
}

/** Mirrors how the adapters substitute each parameter into the method body. */
function resolveArg(method: InferredMethod, index: number): FlowArg {
  const param = method.params[index] ?? ''
  const type = method.paramTypes?.[index] ?? 'string'
  for (const step of method.steps) {
    const el = step.element
    if (!el) continue
    if (step.action === 'click' && el.template) {
      const templateParam = el.template.kind === 'date' ? 'date' : 'value'
      if (param === templateParam) {
        return {
          type,
          value: el.template.capturedValue,
          fromFill: false,
          isoDate: el.template.capturedNormalized,
        }
      }
    }
    if (step.action === 'click' && isContainerParam(el) && param === 'name') {
      return { type, value: el.composed?.anchor.filterText ?? '', fromFill: false }
    }
    if (paramSlug(el.name) !== param) continue
    if (step.action === 'fill') {
      return { type, value: step.value ?? '', element: el, fromFill: true }
    }
    if (step.action === 'select') {
      return { type, value: step.value ?? '', fromFill: false }
    }
    if ((step.action === 'check' || step.action === 'uncheck') && type === 'boolean') {
      return { type, value: String(step.action === 'check'), fromFill: false }
    }
  }
  return defaultArg(param, type, method.steps)
}

function resolveArgs(method: InferredMethod): FlowArg[] {
  return method.params.map((_, index) => resolveArg(method, index))
}

/** Position of a method in the page: its first user step (network steps are re-threaded later). */
function methodPosition(method: InferredMethod, index: Map<IRStep, number>): number {
  const positions = method.steps
    .filter((s) => s.action !== 'network')
    .map((s) => index.get(s) ?? Number.POSITIVE_INFINITY)
  return positions.length > 0 ? Math.min(...positions) : Number.POSITIVE_INFINITY
}

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i

/**
 * Navigate steps hold a route (`/cart`); a driver without a configured base URL needs the full
 * address, so a route is completed with the origin the session was recorded on.
 */
export function absoluteUrl(baseUrl: string | undefined, url: string): string {
  return baseUrl && !ABSOLUTE_URL.test(url) ? `${baseUrl}${url}` : url
}

function pageItems(page: IRPage): FlowItem[] {
  const methods = page.inferredMethods ?? []
  if (methods.length === 0) return [{ kind: 'inline', page }]

  const index = new Map<IRStep, number>()
  page.steps.forEach((step, i) => index.set(step, i))
  const owned = new Set<IRStep>(methods.flatMap((m) => m.steps))

  const positioned: { position: number; item: FlowItem }[] = methods.map((method) => ({
    position: methodPosition(method, index),
    item: { kind: 'call', page, method, args: resolveArgs(method) },
  }))
  for (const step of page.steps) {
    if (step.action !== 'navigate' || !step.url || owned.has(step)) continue
    positioned.push({
      position: index.get(step) ?? Number.POSITIVE_INFINITY,
      item: { kind: 'visit', page, url: absoluteUrl(page.baseUrl, step.url) },
    })
  }
  return positioned.sort((a, b) => a.position - b.position).map((p) => p.item)
}

export function buildScenarioFlow(scenario: IRScenario): FlowItem[] {
  return scenario.pages.flatMap(pageItems)
}

/** Pages the flow actually calls into, in order of first use. */
export function pagesUsed(flow: FlowItem[]): IRPage[] {
  const used: IRPage[] = []
  for (const item of flow) {
    if (item.kind === 'inline') continue
    if (!used.includes(item.page)) used.push(item.page)
  }
  return used
}

/**
 * The URL the test opens first. A recording whose first step is already a navigation carries it
 * itself, and a start page the browser cannot open (`about:blank`) has nothing to open.
 */
export function initialUrl(scenario: IRScenario, flow: FlowItem[]): string | undefined {
  const url = scenario.startUrl
  if (!url || !NAVIGABLE_URL_PATTERN.test(url)) return undefined
  const first = flow[0]
  if (first?.kind === 'visit') return undefined
  if (first?.kind === 'inline' && first.page.steps[0]?.action === 'navigate') return undefined
  return url
}
