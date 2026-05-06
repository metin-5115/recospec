import type { RecordedAction, ElementSnapshot } from '@shared/types/action'
import type { Locator } from '@shared/types/locator'
import type { IRStep, IRElement } from '../ir/types'
import { normalizeUrl } from './url-normalizer'
import { nameElement } from '../planner/element-namer'

export interface NormalizedActions {
  sessionId: string
  flatSteps: IRStep[]
}

function buildElement(
  snapshot: ElementSnapshot,
  primaryLocator: Locator,
  usedNames: Set<string>,
): IRElement {
  const name = nameElement(snapshot, primaryLocator, usedNames)
  usedNames.add(name)
  return {
    name,
    locatorStrategy: primaryLocator.strategy,
    locatorValue: primaryLocator.framework.playwright ?? (primaryLocator.selector as string),
    tagName: snapshot.tagName,
  }
}

function isSameFillMerge(prev: IRStep, curr: RecordedAction): boolean {
  return (
    curr.type === 'fill' &&
    prev.action === 'fill' &&
    prev.element !== undefined &&
    curr.target !== undefined &&
    prev.element.locatorValue ===
      (curr.target.primaryLocator.framework.playwright ??
        (curr.target.primaryLocator.selector as string))
  )
}

export function normalizeActions(actions: RecordedAction[]): NormalizedActions {
  const sessionId = actions[0]?.sessionId ?? ''
  const steps: IRStep[] = []
  const usedNames = new Set<string>()

  for (const action of actions) {
    const { actionId: id, type, payload, pageUrl, annotation } = action

    if (type === 'navigate') {
      steps.push({ id, action: 'navigate', url: normalizeUrl(pageUrl), annotation })
      continue
    }

    if (type === 'click' || type === 'fill') {
      if (!action.target) continue
      const element = buildElement(
        action.target.elementSnapshot,
        action.target.primaryLocator,
        usedNames,
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
      steps.push({ id, action: 'assert', annotation })
    }
  }

  return { sessionId, flatSteps: steps }
}
