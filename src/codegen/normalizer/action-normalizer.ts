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
  return summary
}

function toIrFallbacks(fallbacks: Locator[] | undefined): IRFallback[] {
  if (!fallbacks?.length) return []
  return fallbacks.map((l) => ({ strategy: l.strategy, locatorValue: rawSelector(l) }))
}

function extractInputType(snapshot: ElementSnapshot): string | undefined {
  if (snapshot.tagName !== 'input') return undefined
  const t = snapshot.attributes?.type
  return t ? t.toLowerCase() : 'text'
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
): IRElement {
  const key = rawSelector(primaryLocator)
  const irFallbacks = toIrFallbacks(fallbackLocators)
  const elementSnapshot = summarizeSnapshot(snapshot)
  const inputType = extractInputType(snapshot)
  const existing = locatorToName.get(key)
  if (existing) {
    return {
      name: existing,
      locatorStrategy: primaryLocator.strategy,
      locatorValue: key,
      fallbackLocators: irFallbacks.length ? irFallbacks : undefined,
      tagName: snapshot.tagName,
      inputType,
      elementSnapshot,
      shadowContext,
      shadowClosed,
      frameContext,
    }
  }
  const name = nameElement(snapshot, primaryLocator, usedNames)
  usedNames.add(name)
  locatorToName.set(key, name)
  return {
    name,
    locatorStrategy: primaryLocator.strategy,
    locatorValue: key,
    fallbackLocators: irFallbacks.length ? irFallbacks : undefined,
    tagName: snapshot.tagName,
    inputType,
    elementSnapshot,
    shadowContext,
    shadowClosed,
    frameContext,
  }
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

    if (type === 'click' || type === 'fill') {
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
      )
      const step: IRStep = { id, action: type, element, annotation }
      if (type === 'fill' && payload?.value !== undefined) {
        step.value = String(payload.value)
      }

      const last = steps[steps.length - 1]
      if (last && isSameFillMerge(last, action) && payload?.value !== undefined) {
        last.value = String(payload.value)
        continue
      }

      steps.push(step)
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
          )
        : undefined

      steps.push({ id, action: 'assert', element, assertionDetail, annotation })
    }
  }

  return { sessionId, flatSteps: steps }
}
