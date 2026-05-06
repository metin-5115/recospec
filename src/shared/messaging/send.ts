import type {
  BackgroundToContentMessage,
  BackgroundToUIMessage,
  ContentToBackgroundMessage,
  UIToBackgroundMessage,
} from '@shared/types/messages'

export async function sendToBackground(
  message: UIToBackgroundMessage | ContentToBackgroundMessage,
): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message)
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
