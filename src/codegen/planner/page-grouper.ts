import type { IRStep, IRPage, IRDocument, IRElement } from '../ir/types'
import { normalizeUrl, urlToPageName } from '../normalizer/url-normalizer'

function uniquifyClassName(base: string, used: Set<string>): string {
  const name = base + 'Page'
  if (!used.has(name)) return name
  let i = 2
  while (used.has(`${name}${i}`)) i++
  return `${name}${i}`
}

export function groupIntoPages(flatSteps: IRStep[], sessionStartUrl: string): IRDocument['pages'] {
  const pages: IRPage[] = []
  const usedClassNames = new Set<string>()

  let currentUrl = normalizeUrl(sessionStartUrl)
  let currentSteps: IRStep[] = []
  let currentElements: IRElement[] = []
  const seenElements = new Set<string>()

  function flushPage() {
    if (currentSteps.length === 0) return
    const pageName = urlToPageName(currentUrl)
    const className = uniquifyClassName(pageName, usedClassNames)
    usedClassNames.add(className)
    pages.push({
      name: pageName,
      className,
      normalizedUrl: currentUrl,
      steps: currentSteps,
      elements: currentElements,
    })
    currentSteps = []
    currentElements = []
    seenElements.clear()
  }

  for (const step of flatSteps) {
    if (step.action === 'navigate' && step.url) {
      flushPage()
      currentUrl = step.url
      currentSteps.push(step)
      continue
    }

    currentSteps.push(step)

    if (step.element && !seenElements.has(step.element.locatorValue)) {
      seenElements.add(step.element.locatorValue)
      currentElements.push(step.element)
    }
  }

  flushPage()

  return pages
}
