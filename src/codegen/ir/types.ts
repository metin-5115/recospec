export type IRActionType = 'navigate' | 'click' | 'fill' | 'assert'

export interface IRElement {
  name: string
  locatorStrategy: string
  locatorValue: string
  fallbackLocator?: string
  tagName: string
}

export interface IRStep {
  id: string
  action: IRActionType
  element?: IRElement
  value?: string
  url?: string
  annotation?: string
}

export interface IRPage {
  name: string
  className: string
  normalizedUrl: string
  steps: IRStep[]
  elements: IRElement[]
}

export interface IRScenario {
  name: string
  pages: IRPage[]
}

export interface IRDocument {
  sessionId: string
  scenario: IRScenario
  pages: IRPage[]
  generatedAt: number
}

export type { GeneratedFile, GeneratedCode } from '@shared/types/generated'
