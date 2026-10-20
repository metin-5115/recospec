import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { PREF_KEYS } from '@shared/constants'
import { isBoolean, readPref, writePref } from '../preferences'

interface AdvancedSectionProps {
  children: ReactNode
}

/**
 * Collapsible home for everything the common "pick a framework, generate, download" path does not
 * need. Closed by default; the last choice is remembered across panel opens.
 */
export function AdvancedSection({ children }: AdvancedSectionProps) {
  const [isOpen, setIsOpen] = useState(() => readPref(PREF_KEYS.advancedOpen, isBoolean, false))
  const regionId = useId()
  const labelId = useId()
  const Chevron = isOpen ? ChevronDown : ChevronRight

  const toggle = (): void => {
    const next = !isOpen
    setIsOpen(next)
    writePref(PREF_KEYS.advancedOpen, next)
  }

  return (
    <section className="rounded-lg border border-border bg-bg">
      <button
        type="button"
        id={labelId}
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={regionId}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text"
      >
        <Chevron className="h-3.5 w-3.5" aria-hidden="true" />
        Advanced
        <span className="ml-auto font-normal normal-case tracking-normal text-text-subtle">
          options · CLI · Claude prompt · local LLM
        </span>
      </button>
      {isOpen && (
        <div
          id={regionId}
          role="region"
          aria-labelledby={labelId}
          className="space-y-3 border-t border-border px-3 py-3"
        >
          {children}
        </div>
      )}
    </section>
  )
}
