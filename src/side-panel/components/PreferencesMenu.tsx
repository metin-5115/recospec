import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Settings } from 'lucide-react'
import type { FrameworkId } from '@shared/types/generated'
import { useSessionStore } from '../sessionStore'

const FRAMEWORK_OPTIONS: ReadonlyArray<{ id: FrameworkId; label: string }> = [
  { id: 'playwright-ts', label: 'Playwright (TS)' },
  { id: 'cypress', label: 'Cypress' },
  { id: 'selenium-py', label: 'Selenium Python' },
  { id: 'selenium-java', label: 'Selenium Java' },
]

/** Frameworks that can emit BDD (Gherkin) output today. Mirrors FrameworkPicker. */
const BDD_SUPPORTED: ReadonlySet<FrameworkId> = new Set<FrameworkId>(['playwright-ts'])

/**
 * Header gear popover for persistent defaults. Unlike the inline export
 * controls (which only appear once a recording is stopped), this is always
 * available so the user can configure defaults up front — and every choice is
 * persisted by the store, so it survives reloads and seeds future recordings.
 *
 * Modeled on `HelpMenu` for the open/close + Escape + outside-click + focus
 * return behaviour, but the body is a form (`role="group"`, native Tab) rather
 * than a roving menuitem list.
 */
export function PreferencesMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const selectedFramework = useSessionStore((s) => s.selectedFramework)
  const setSelectedFramework = useSessionStore((s) => s.setSelectedFramework)
  const autoWaitEnabled = useSessionStore((s) => s.autoWaitEnabled)
  const setAutoWaitEnabled = useSessionStore((s) => s.setAutoWaitEnabled)
  const bddEnabled = useSessionStore((s) => s.bddEnabled)
  const setBddEnabled = useSessionStore((s) => s.setBddEnabled)
  const includeMocks = useSessionStore((s) => s.includeMocks)
  const setIncludeMocks = useSessionStore((s) => s.setIncludeMocks)
  const pierceClosedShadow = useSessionStore((s) => s.pierceClosedShadow)
  const setPierceClosedShadow = useSessionStore((s) => s.setPierceClosedShadow)

  const bddAvailable = BDD_SUPPORTED.has(selectedFramework)

  useEffect(() => {
    if (!isOpen) return
    function onPointerDown(e: PointerEvent): void {
      const target = e.target as Node | null
      if (target && !panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setIsOpen(false)
      }
    }
    function onKeyDown(e: globalThis.KeyboardEvent): void {
      if (e.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsOpen(true)
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        aria-label="Preferences"
        title="Preferences"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          role="group"
          aria-label="Preferences"
          className="absolute right-0 top-full z-50 mt-1 w-64 space-y-3 rounded-lg border border-border bg-bg p-3 shadow-lg outline-none"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-subtle">
            Defaults for new recordings
          </p>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-text-muted">Framework</span>
            <select
              value={selectedFramework}
              onChange={(e) => setSelectedFramework(e.target.value as FrameworkId)}
              className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            >
              {FRAMEWORK_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={includeMocks}
              onChange={(e) => setIncludeMocks(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-accent"
            />
            <span>Include network mocks</span>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={autoWaitEnabled}
              onChange={(e) => setAutoWaitEnabled(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-accent"
            />
            <span>Auto-detect waits</span>
          </label>

          <label
            className={`flex items-center gap-2 text-xs ${
              bddAvailable
                ? 'cursor-pointer text-text-muted'
                : 'cursor-not-allowed text-text-subtle'
            }`}
            title={
              bddAvailable
                ? undefined
                : 'BDD (Gherkin) output is only available for Playwright (TS) today.'
            }
          >
            <input
              type="checkbox"
              checked={bddAvailable && bddEnabled}
              disabled={!bddAvailable}
              onChange={(e) => setBddEnabled(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-accent disabled:cursor-not-allowed"
            />
            <span>BDD output (Gherkin)</span>
          </label>

          <label
            className="flex cursor-pointer items-center gap-2 text-xs text-text-muted"
            title="Invasive: wraps attachShadow to reach elements inside closed shadow roots. Off by default."
          >
            <input
              type="checkbox"
              checked={pierceClosedShadow}
              onChange={(e) => setPierceClosedShadow(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-accent"
            />
            <span>Pierce closed shadow DOM</span>
          </label>
        </div>
      )}
    </div>
  )
}
