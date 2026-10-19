import type {
  BackgroundToContentMessage,
  BackgroundToUIMessage,
  ContentToBackgroundMessage,
  UIToBackgroundMessage,
} from '@shared/types/messages'
import { logger } from '@shared/logger'

type Handler<T> = (msg: T, sender: chrome.runtime.MessageSender) => void | Promise<void>
type ChromeListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0]

/** Every contract message is an object with a string `type`; anything else is not one of ours. */
function hasMessageType(value: unknown): value is { type: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

/**
 * Registers `handler` for contract messages. The `type` field is checked here; the handler's own
 * `switch` (closed by `assertNever`) deals with types it does not know, so a message from another
 * build is logged and dropped, never cast into a shape it does not have.
 */
function listen<T extends { type: string }>(handler: Handler<T>): () => void {
  const listener: ChromeListener = (message, sender, sendResponse) => {
    if (!hasMessageType(message)) {
      logger.warn('[msg] Ignored a message without a string type', message)
      sendResponse(undefined)
      return false
    }
    // The union is the contract between our own contexts; `type` is the only part verified here.
    const result = handler(message as T, sender)
    if (result instanceof Promise) {
      result.catch((err: unknown) => logger.warn('[msg] A message handler rejected', err))
    }
    sendResponse(undefined)
    return false
  }
  chrome.runtime.onMessage.addListener(listener)
  return () => chrome.runtime.onMessage.removeListener(listener)
}

export const onBackgroundMessage = (
  handler: Handler<UIToBackgroundMessage | ContentToBackgroundMessage>,
): (() => void) => listen<UIToBackgroundMessage | ContentToBackgroundMessage>(handler)

export const onContentMessage = (handler: Handler<BackgroundToContentMessage>): (() => void) =>
  listen<BackgroundToContentMessage>(handler)

export const onUIMessage = (handler: Handler<BackgroundToUIMessage>): (() => void) =>
  listen<BackgroundToUIMessage>(handler)
