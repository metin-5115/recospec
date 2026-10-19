import { memo } from 'react'
import { CheckCircle2, Circle, CircleDot, Loader2, Pause, Play, Square } from 'lucide-react'
import { HelpMenu } from '../components/HelpMenu'
import { PreferencesMenu } from '../components/PreferencesMenu'

interface RecordingHeaderProps {
  isRecording: boolean
  isPaused: boolean
  isStarting: boolean
  isProbeActive: boolean
  onToggleAssertionProbe: () => void
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}

/** Title bar with the recording controls. Only re-renders when the recording state changes. */
export const RecordingHeader = memo(function RecordingHeader({
  isRecording,
  isPaused,
  isStarting,
  isProbeActive,
  onToggleAssertionProbe,
  onStart,
  onPause,
  onResume,
  onStop,
}: RecordingHeaderProps) {
  const isActive = isRecording || isPaused
  return (
    <header className="flex items-center justify-between border-b border-border px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-accent text-sm font-bold text-white shadow-accent-glow">
          R
        </span>
        <span className="text-base font-semibold tracking-tight text-gradient-accent">
          Recospec
        </span>
        <StatusBadge isRecording={isRecording} isPaused={isPaused} />
      </div>

      <div className="flex items-center gap-2">
        <PreferencesMenu />
        <HelpMenu />

        {isRecording && (
          <button
            onClick={onToggleAssertionProbe}
            title={isProbeActive ? 'Cancel assertion mode' : 'Add assertion by clicking an element'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              isProbeActive
                ? 'bg-warning-soft text-warning'
                : 'bg-bg-muted text-text-muted hover:bg-bg-elevated hover:text-text'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {isProbeActive ? 'Pick element…' : 'Assert'}
          </button>
        )}

        {isActive && (
          <>
            {isRecording ? (
              <button
                onClick={onPause}
                className="inline-flex items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg-elevated hover:text-text"
              >
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                Pause
              </button>
            ) : (
              <button
                onClick={onResume}
                className="inline-flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Resume
              </button>
            )}
            <button
              onClick={onStop}
              className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-rose-500"
            >
              <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              Stop
            </button>
          </>
        )}

        {!isActive && (
          <button
            onClick={onStart}
            disabled={isStarting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-rose-500 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Starting…
              </>
            ) : (
              <>
                <Circle className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                Record
              </>
            )}
          </button>
        )}
      </div>
    </header>
  )
})

interface StatusBadgeProps {
  isRecording: boolean
  isPaused: boolean
}

function StatusBadge({ isRecording, isPaused }: StatusBadgeProps) {
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
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${palette}`}
    >
      <CircleDot className={`h-2.5 w-2.5 ${dotPalette}`} aria-hidden="true" />
      {label}
    </span>
  )
}
