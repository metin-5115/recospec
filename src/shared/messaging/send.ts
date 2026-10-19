import type {
  BackgroundToContentMessage,
  BackgroundToUIMessage,
  ContentToBackgroundMessage,
  UIToBackgroundMessage,
} from '@shared/types/messages'

/** Delivers a message to the background worker and rejects when it cannot be reached. */
export async function trySendToBackground(
  message: UIToBackgroundMessage | ContentToBackgroundMessage,
): Promise<void> {
  await chrome.runtime.sendMessage(message)
}

export async function sendToBackground(
  message: UIToBackgroundMessage | ContentToBackgroundMessage,
): Promise<void> {
  try {
    await trySendToBackground(message)
  } catch {
    // Background may not be ready yet; ignore
  }
}

export async function sendToTab(tabId: number, message: BackgroundToContentMessage): Promise<void> {
  await chrome.tabs.sendMessage(tabId, message)
}

export async function broadcastToUI(message: BackgroundToUIMessage): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message)
  } catch {
    // No UI listeners open; ignore
  }
}
