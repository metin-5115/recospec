import type { Locator } from '@shared/types/locator'

export interface LocatorStrategy {
  readonly name: string
  readonly basePriority: number
  evaluate(element: Element, doc: Document): Locator | null
}
