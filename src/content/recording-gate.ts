/**
 * The content script loads in every frame of every page. Announcing itself to the service worker
 * wakes it (module graph, IndexedDB), which is only worth it while a recording may need to resume
 * on this page — so it asks the `chrome.storage.session` mirror first.
 */
export async function announceWhenRecording(
  isRecording: () => Promise<boolean>,
  announce: () => Promise<void>,
): Promise<void> {
  if (await isRecording()) await announce()
}
