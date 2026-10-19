import { memo } from 'react'
import { useSessionStore } from '../sessionStore'

type Tab = 'recording' | 'history'

interface TabBarProps {
  activeTab: Tab
  onChange: (tab: Tab) => void
}

/** The Recording / History switch with live counts. */
export const TabBar = memo(function TabBar({ activeTab, onChange }: TabBarProps) {
  const stepCount = useSessionStore((s) => s.steps.length)
  const sessionCount = useSessionStore((s) => s.sessions.length)
  return (
    <div className="flex gap-1 border-b border-border bg-bg-elevated/40 px-3 pb-0 pt-2">
      <TabButton
        label="Recording"
        count={stepCount}
        active={activeTab === 'recording'}
        onClick={() => onChange('recording')}
      />
      <TabButton
        label="History"
        count={sessionCount}
        active={activeTab === 'history'}
        onClick={() => onChange('history')}
      />
    </div>
  )
})

interface TabButtonProps {
  label: string
  count: number
  active: boolean
  onClick: () => void
}

function TabButton({ label, count, active, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium transition-all ${
        active
          ? 'bg-bg text-text shadow-[0_-2px_0_0_var(--color-accent)_inset]'
          : 'text-text-muted hover:bg-bg/60 hover:text-text'
      }`}
    >
      {label}
      {count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            active ? 'bg-accent-soft text-accent' : 'bg-bg-muted text-text-muted'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}
