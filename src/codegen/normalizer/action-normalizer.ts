import type { RecordedAction, ElementSnapshot, AssertionType } from '@shared/types/action'
import type { Locator, ShadowContext, FrameContext } from '@shared/types/locator'
import type { IRStep, IRElement, AssertionDetail } from '../ir/types'
import { normalizeUrl } from './url-normalizer'
import { nameElement } from '../planner/element-namer'

export interface NormalizedActions {
  sessionId: string
  flatSteps: IRStep[]
}

function rawSelector(locator: Locator): string {
  return typeof locator.selector === 'string' ? locator.selector : JSON.stringify(locator.selector)
}

function buildElement(
  snapshot: ElementSnapshot,
  primaryLocator: Locator,
  usedNames: Set<string>,
  locatorToName: Map<string, string>,
  shadowContext?: ShadowContext,
  shadowClosed?: boolean,
  frameContext?: FrameContext,
): IRElement {
  const key = rawSelector(primaryLocator)
  const existing = locatorToName.get(key)
  if (existing) {
    return {
      name: existing,
      locatorStrategy: primaryLocator.strategy,
      locatorValue: key,
      tagName: snapshot.tagName,
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
    tagName: snapshot.tagName,
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
