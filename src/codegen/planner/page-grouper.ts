import type { IRStep, IRPage, IRDocument, IRElement } from '../ir/types'
import { normalizeUrl, urlToPageName } from '../normalizer/url-normalizer'
import { inferMethods } from './method-inferer'

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
  // Track pages by normalizedUrl for collision detection
  const pagesByUrl = new Map<string, IRPage>()

  let currentUrl = normalizeUrl(sessionStartUrl)
  let currentPageTitle: string | undefined
  let currentSteps: IRStep[] = []
  let currentElements: IRElement[] = []
  const seenElements = new Set<string>()

  function flushPage() {
    if (currentSteps.length === 0) return

    const pageName = urlToPageName(currentUrl)
    const className = uniquifyClassName(pageName, usedClassNames)
    usedClassNames.add(className)

    // Collision detection: same URL pattern, different title
    const existing = pagesByUrl.get(currentUrl)
    const hasCollision =
      existing !== undefined &&
      currentPageTitle !== undefined &&
      existing.pageTitle !== undefined &&
      currentPageTitle !== existing.pageTitle

    const page: IRPage = {
      name: pageName,
      className,
      normalizedUrl: currentUrl,
      pageTitle: currentPageTitle,
      collisionWarning: hasCollision || undefined,
      steps: currentSteps,
      elements: currentElements,
      inferredMethods: inferMethods(currentSteps),
    }

    pages.push(page)

    if (!pagesByUrl.has(currentUrl)) {
      pagesByUrl.set(currentUrl, page)
    }

    currentSteps = []
    currentElements = []
    seenElements.clear()
    currentPageTitle = undefined
  }

  for (const step of flatSteps) {
    if (step.action === 'navigate' && step.url) {
      flushPage()
      currentUrl = step.url
      currentPageTitle = step.pageTitle
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
