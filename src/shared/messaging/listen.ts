import type {
  BackgroundToContentMessage,
  BackgroundToUIMessage,
  ContentToBackgroundMessage,
  UIToBackgroundMessage,
} from '@shared/types/messages'

type Handler<T> = (msg: T, sender: chrome.runtime.MessageSender) => void | Promise<void>
type ChromeListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0]

function listen<T>(handler: Handler<T>): () => void {
  const listener: ChromeListener = (message, sender, sendResponse) => {
    const result = handler(message as T, sender)
    if (result instanceof Promise) {
      result.catch(() => {})
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
