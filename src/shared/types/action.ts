import type { Locator, LocatorBundle } from './locator'

export type ActionType =
  | 'click'
  | 'dblclick'
  | 'fill'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'navigate'
  | 'hover'
  | 'scroll'
  | 'keypress'
  | 'assert'
  | 'wait'
  | 'screenshot'

export interface ElementSnapshot {
  tagName: string
  attributes: Record<string, string>
  textContent: string
}

export interface RecordedAction {
  actionId: string
  sessionId: string
  sequenceNumber: number
  type: ActionType
  timestamp: number
  pageUrl: string
  target?: {
    primaryLocator: Locator
    fallbackLocators: Locator[]
    elementSnapshot: ElementSnapshot
  }
  elementSnapshot?: ElementSnapshot
  payload?: Record<string, unknown>
  annotation?: string
}

export interface CapturedEvent {
  type: ActionType
  target: {
    locatorBundle: LocatorBundle | null
    elementSnapshot: ElementSnapshot
  } | null
  payload?: Record<string, unknown>
  timestamp: number
  pageMetadata: {
    url: string
    title: string
  }
}
