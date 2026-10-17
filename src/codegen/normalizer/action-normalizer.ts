import type {
  RecordedAction,
  ElementSnapshot,
  AssertionType,
  NetworkPayload,
} from '@shared/types/action'
import type { Locator, ShadowContext, FrameContext } from '@shared/types/locator'
import type {
  IRStep,
  IRElement,
  AssertionDetail,
  IRElementSnapshot,
  IRFallback,
  IRNetworkInfo,
} from '../ir/types'
import { normalizeUrl } from './url-normalizer'
import { normalizeWaitAction } from './wait-normalizer'
import { nameElement } from '../planner/element-namer'

export interface NormalizedActions {
  sessionId: string
  flatSteps: IRStep[]
}

function rawSelector(locator: Locator): string {
  return typeof locator.selector === 'string' ? locator.selector : JSON.stringify(locator.selector)
}

function summarizeSnapshot(snapshot: ElementSnapshot): IRElementSnapshot {
  const attrs = snapshot.attributes ?? {}
  const summary: IRElementSnapshot = { localName: snapshot.tagName }
  const text = snapshot.textContent?.trim()
  if (text) summary.textContent = text.slice(0, 120)
  if (attrs.id) summary.id = attrs.id
  if (attrs.class) summary.className = attrs.class
  if (attrs['data-testid']) summary.testId = attrs['data-testid']
  if (attrs.role) summary.role = attrs.role
  if (attrs.name) summary.fieldName = attrs.name
  if (attrs.autocomplete) summary.autocomplete = attrs.autocomplete.toLowerCase()
  return summary
}

function toIrFallbacks(fallbacks: Locator[] | undefined): IRFallback[] {
  if (!fallbacks?.length) return []
  return fallbacks.map((l) => {
    // A composed fallback degrades to its precomputed XPath: IRFallback is a
    // flat (strategy, value) pair consumed by runtime self-healing helpers in
    // every framework, and the XPath is the one expression they can all run.
    if (l.strategy === 'composed' && l.composed) {
      return { strategy: 'xpath', locatorValue: l.composed.xpath }
    }
    // Template fallbacks likewise degrade to the captured-value-instantiated
    // XPath — the runtime helpers have no parameter to fill the template with.
    if (l.strategy === 'template' && l.template) {
      return { strategy: 'xpath', locatorValue: l.template.xpath }
    }
    return { strategy: l.strategy, locatorValue: rawSelector(l) }
  })
}

function extractInputType(snapshot: ElementSnapshot): string | undefined {
  if (snapshot.tagName !== 'input') return undefined
  const t = snapshot.attributes?.type
  return t ? t.toLowerCase() : 'text'
}

const MS_PER_DAY = 86_400_000

/**
 * Whole-day offset between the recording moment and a captured ISO calendar
 * date. `Date.parse('yyyy-MM-dd')` is UTC midnight, so the result can be off
 * by one across timezone edges — acceptable for `relative` mode's purpose.
 */
function relativeDaysFrom(capturedIso: string, recordedAt: number | undefined): number | undefined {
  if (recordedAt === undefined) return undefined
  const captured = Date.parse(capturedIso)
  if (Number.isNaN(captured)) return undefined
  return Math.round((captured - recordedAt) / MS_PER_DAY)
}

function buildElement(
  snapshot: ElementSnapshot,
  primaryLocator: Locator,
  fallbackLocators: Locator[] | undefined,
  usedNames: Set<string>,
  locatorToName: Map<string, string>,
  shadowContext?: ShadowContext,
  shadowClosed?: boolean,
  frameContext?: FrameContext,
  recordedAt?: number,
): IRElement {
  const key = rawSelector(primaryLocator)
  const irFallbacks = toIrFallbacks(fallbackLocators)
  const elementSnapshot = summarizeSnapshot(snapshot)
  const inputType = extractInputType(snapshot)
  const composed = primaryLocator.strategy === 'composed' ? primaryLocator.composed : undefined
  const template = primaryLocator.strategy === 'template' ? primaryLocator.template : undefined
  const layout = primaryLocator.strategy === 'layout' ? primaryLocator.layout : undefined
  const templateRelativeDays =
    template?.kind === 'date' && template.capturedNormalized
      ? relativeDaysFrom(template.capturedNormalized, recordedAt)
      : undefined
  const fragile =
    primaryLocator.warning === 'positional-index' ||
    typeof composed?.nthIndex === 'number' ||
    typeof composed?.anchor.nthIndex === 'number' ||
    undefined
  const existing = locatorToName.get(key)
  const shared = {
    locatorStrategy: primaryLocator.strategy,
    locatorValue: key,
    fallbackLocators: irFallbacks.length ? irFallbacks : undefined,
    tagName: snapshot.tagName,
    inputType,
    elementSnapshot,
    shadowContext,
    shadowClosed,
    frameContext,
    composed,
    template,
    layout,
    templateRelativeDays,
    fragile,
  }
  if (existing) {
    return { name: existing, ...shared }
  }
  const name = nameElement(snapshot, primaryLocator, usedNames)
  usedNames.add(name)
  locatorToName.set(key, name)
  return { name, ...shared }
}

type ElementActionType = 'click' | 'dblclick' | 'hover' | 'fill' | 'select' | 'check' | 'uncheck'

const ELEMENT_ACTION_TYPES: ReadonlySet<string> = new Set<ElementActionType>([
  'click',
  'dblclick',
  'hover',
  'fill',
  'select',
  'check',
  'uncheck',
])

/** Actions whose recorded `payload.value` becomes the IR step value. */
const VALUE_ACTIONS: ReadonlySet<string> = new Set<ElementActionType>(['fill', 'select'])

/** A dblclick fires after two click events; replaying all three would triple-click. */
const DBLCLICK_PRECEDING_CLICKS = 2

function isElementAction(type: RecordedAction['type']): type is ElementActionType {
  return ELEMENT_ACTION_TYPES.has(type)
}

function collapseClicksBeforeDblclick(steps: IRStep[], element: IRElement): void {
  for (let n = 0; n < DBLCLICK_PRECEDING_CLICKS; n++) {
    const prev = steps[steps.length - 1]
    if (prev?.action !== 'click' || prev.element?.locatorValue !== element.locatorValue) return
    steps.pop()
  }
}

/** Actions a user starts by clicking the field: focusing an input or opening a select. */
const CLICK_TO_FOCUS_ACTIONS: ReadonlySet<string> = new Set<ElementActionType>(['fill', 'select'])

/** The click that merely focuses a field right before it is filled adds nothing to a replay. */
function dropFocusClickBefore(steps: IRStep[], element: IRElement): void {
  const prev = steps[steps.length - 1]
  if (prev?.action === 'click' && prev.element?.locatorValue === element.locatorValue) steps.pop()
}

function isSameFillMerge(prev: IRStep, curr: RecordedAction): boolean {
  return (
    curr.type === 'fill' &&
    prev.action === 'fill' &&
    prev.element !== undefined &&
    curr.target !== undefined &&
    prev.element.locatorValue === rawSelector(curr.target.primaryLocator)
  )
}

export function normalizeActions(actions: RecordedAction[]): NormalizedActions {
  const sessionId = actions[0]?.sessionId ?? ''
  const steps: IRStep[] = []
  const usedNames = new Set<string>()
  const locatorToName = new Map<string, string>()

  for (const action of actions) {
    const { actionId: id, type, payload, pageUrl, annotation } = action

    if (type === 'navigate') {
      steps.push({
        id,
        action: 'navigate',
        url: normalizeUrl(pageUrl),
        pageTitle: action.pageTitle,
        annotation,
      })
      continue
    }

    if (type === 'keypress') {
      const key = payload?.key !== undefined ? String(payload.key) : undefined
      steps.push({ id, action: 'keypress', key, annotation })
      continue
    }

    if (isElementAction(type)) {
      if (!action.target) continue
      const element = buildElement(
        action.target.elementSnapshot,
        action.target.primaryLocator,
        action.target.fallbackLocators,
        usedNames,
        locatorToName,
        action.target.shadowContext,
        action.target.shadowClosed,
        action.target.frameContext,
        action.timestamp,
      )
      const step: IRStep = { id, action: type, element, annotation }
      if (VALUE_ACTIONS.has(type) && payload?.value !== undefined) {
        step.value = String(payload.value)
      }

      if (type === 'dblclick') collapseClicksBeforeDblclick(steps, element)
      if (CLICK_TO_FOCUS_ACTIONS.has(type)) dropFocusClickBefore(steps, element)

      const last = steps[steps.length - 1]
      if (last && isSameFillMerge(last, action) && payload?.value !== undefined) {
        last.value = String(payload.value)
        continue
      }

      steps.push(step)
      continue
    }

    if (type === 'wait') {
      const waitStep = normalizeWaitAction(action, (snapshot, primary, fallbacks, sc, scl, fc) =>
        buildElement(snapshot, primary, fallbacks, usedNames, locatorToName, sc, scl, fc),
      )
      if (waitStep) steps.push(waitStep)
      continue
    }

    if (type === 'network') {
      const np = (payload ?? {}) as Partial<NetworkPayload>
      if (!np.url || !np.method) continue
      const network: IRNetworkInfo = {
        method: np.method,
        url: np.url,
        status: np.status,
        contentType: np.contentType,
        responseBody: np.responseBody,
      }
      steps.push({ id, action: 'network', network, annotation })
      continue
    }

    if (type === 'assert') {
      const assertionDetail: AssertionDetail | undefined =
        payload?.assertionType !== undefined
          ? {
              type: payload.assertionType as AssertionType,
              expected:
                payload.expected !== undefined ? (payload.expected as string | number) : undefined,
              attribute: payload.attribute !== undefined ? String(payload.attribute) : undefined,
              name: payload.name !== undefined ? String(payload.name) : undefined,
              threshold: payload.threshold !== undefined ? Number(payload.threshold) : undefined,
            }
          : undefined

      const element = action.target
        ? buildElement(
            action.target.elementSnapshot,
            action.target.primaryLocator,
            action.target.fallbackLocators,
            usedNames,
            locatorToName,
            action.target.shadowContext,
            action.target.shadowClosed,
            action.target.frameContext,
            action.timestamp,
          )
        : undefined

      steps.push({ id, action: 'assert', element, assertionDetail, annotation })
    }
  }

  return { sessionId, flatSteps: steps }
}
