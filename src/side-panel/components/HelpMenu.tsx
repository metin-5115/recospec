import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Bug, ExternalLink, FileText, HelpCircle, Mail, Play } from 'lucide-react'
import { EXTERNAL_URLS } from '@shared/constants'

interface HelpMenuItem {
  /** Stable key used by the Up/Down arrow navigation. */
  id: string
  label: string
  icon: typeof HelpCircle
  /** Invoked when the user activates the entry with click, Enter, or Space. */
  onActivate: () => void
}

/**
 * Header dropdown surfaced from the `?` icon. Four entries: open the bundled
 * demo page in a new tab, file a bug, send feedback by email, view the
 * bundled getting-started doc. Activation routes for the in-extension URLs
 * use `chrome.runtime.getURL` so they survive extension-ID changes.
 */
export function HelpMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])

  const items: HelpMenuItem[] = [
    {
      id: 'demo',
      label: 'Open demo page',
      icon: Play,
      onActivate: () => {
        void chrome.tabs.create({ url: chrome.runtime.getURL('demo/demo-page.html') })
      },
    },
    {
      id: 'docs',
      label: 'View docs',
      icon: FileText,
      onActivate: () => {
        void chrome.tabs.create({ url: chrome.runtime.getURL('docs/getting-started.html') })
      },
    },
    {
      id: 'bug',
      label: 'Report bug',
      icon: Bug,
      onActivate: () => {
        void chrome.tabs.create({ url: EXTERNAL_URLS.reportBug })
      },
    },
    {
      id: 'feedback',
      label: 'Send feedback',
      icon: Mail,
      onActivate: () => {
        void chrome.tabs.create({ url: EXTERNAL_URLS.sendFeedback })
      },
    },
  ]

  // Outside-click + Escape close the menu and return focus to the trigger
  // so the keyboard user lands somewhere predictable.
  useEffect(() => {
    if (!isOpen) return
    function onPointerDown(e: PointerEvent): void {
      const target = e.target as Node | null
      if (target && !menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
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

  useEffect(() => {
    if (!isOpen) return
    itemRefs.current[focusedIndex]?.focus()
  }, [isOpen, focusedIndex])

  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>): void {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setIsOpen(true)
      setFocusedIndex(0)
    }
  }

  function handleMenuKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) => (i - 1 + items.length) % items.length)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setFocusedIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setFocusedIndex(items.length - 1)
    } else if (e.key === 'Tab') {
      // Tab closes the menu naturally; let focus move forward.
      setIsOpen(false)
    }
  }

  function activate(item: HelpMenuItem): void {
    item.onActivate()
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev)
          setFocusedIndex(0)
        }}
        onKeyDown={handleTriggerKeyDown}
        aria-label="Help"
        title="Help"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Help"
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-bg shadow-lg outline-none"
        >
          <ul className="py-1">
            {items.map((item, index) => {
              const Icon = item.icon
              return (
                <li key={item.id}>
                  <a
                    ref={(el) => {
                      itemRefs.current[index] = el
                    }}
                    href="#"
                    role="menuitem"
                    onClick={(e) => {
                      e.preventDefault()
                      activate(item)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        activate(item)
                      }
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-text outline-none transition-colors hover:bg-bg-muted focus:bg-bg-muted focus-visible:bg-bg-muted"
                  >
                    <Icon className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    <ExternalLink
                      className="h-3 w-3 text-text-subtle opacity-60"
                      aria-hidden="true"
                    />
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
