import { useSession } from '../side-panel/hooks/useSession'

export function PopupApp() {
  const { isRecording } = useSession()

  async function openSidePanel() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id })
    }
  }

  return (
    <div className="w-64 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-900">PlayForge</h1>
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide ${
            isRecording ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isRecording ? 'animate-pulse bg-white' : 'bg-gray-400'
            }`}
          />
          {isRecording ? 'REC' : 'IDLE'}
        </span>
      </div>
      <button
        onClick={openSidePanel}
        className="mt-4 w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Open Side Panel
      </button>
    </div>
  )
}
