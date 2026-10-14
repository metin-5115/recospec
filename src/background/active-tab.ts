/**
 * Resolve the tab a background controller should act on — prefers the focused
 * normal window's active tab and falls back to `tabs.query`.
 */
export async function resolveActiveTab(): Promise<chrome.tabs.Tab | null> {
  try {
    const win = await chrome.windows.getLastFocused({
      populate: true,
      windowTypes: ['normal'],
    })
    const found = win.tabs?.find((t) => t.active)
    if (found?.id !== undefined) return found
  } catch {
    /* fall through */
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    return tab ?? null
  } catch {
    return null
  }
}
