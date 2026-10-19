import { memo } from 'react'
import { useSessionStore } from '../sessionStore'

/** "N steps recorded" line under the panel. */
export const StepCountFooter = memo(function StepCountFooter() {
  const stepCount = useSessionStore((s) => s.steps.length)
  if (stepCount === 0) return null
  return (
    <footer className="border-t border-border px-5 py-2 text-xs text-text-subtle">
      {stepCount} step{stepCount !== 1 ? 's' : ''} recorded
    </footer>
  )
})
