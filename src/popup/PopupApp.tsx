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
      <h1 className="text-base font-bold text-gray-900">PlayForge</h1>
      <div className="mt-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${isRecording ? 'bg-red-500' : 'bg-gray-300'}`} />
        <span className="text-sm text-gray-600">{isRecording ? 'Recording' : 'Idle'}</span>
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
