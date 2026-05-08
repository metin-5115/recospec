import { CircleDot, PanelRightOpen } from 'lucide-react'
import { useSession } from '../side-panel/hooks/useSession'

export function PopupApp() {
  const { isRecording, isPaused } = useSession()

  async function openSidePanel() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id })
    }
  }

  const label = isRecording ? 'REC' : isPaused ? 'PAUSE' : 'IDLE'
  const palette = isRecording
    ? 'bg-danger-soft text-danger'
    : isPaused
      ? 'bg-warning-soft text-warning'
      : 'bg-bg-muted text-text-muted'
  const dotPalette = isRecording
    ? 'fill-danger text-danger animate-pulse'
    : isPaused
      ? 'fill-warning text-warning'
      : 'fill-text-subtle text-text-subtle'

  return (
    <div className="w-72 space-y-4 bg-bg p-5 text-text">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold tracking-tight text-gradient-accent">PlayForge</h1>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${palette}`}
        >
          <CircleDot className={`h-2.5 w-2.5 ${dotPalette}`} aria-hidden="true" />
          {label}
        </span>
      </div>

      <button
        onClick={openSidePanel}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-accent px-3.5 py-2.5 text-sm font-semibold text-white shadow-accent-glow transition-all hover:scale-[1.01] active:scale-[0.99]"
      >
        <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
        Open Side Panel
      </button>

      <p className="text-center text-[11px] text-text-subtle">v0.1.0 · MIT</p>
    </div>
  )
}
