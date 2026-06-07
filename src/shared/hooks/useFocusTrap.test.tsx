/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef, type ReactElement } from 'react'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useFocusTrap } from './useFocusTrap'

afterEach(cleanup)

function TestModal({ onEscape }: { onEscape?: () => void }): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, { onEscape })
  return (
    <div ref={ref} data-testid="modal">
      <button data-testid="first">First</button>
      <button data-testid="middle">Middle</button>
      <button data-testid="last">Last</button>
    </div>
  )
}

describe('useFocusTrap', () => {
  it('moves focus to the first focusable child on mount', () => {
    render(<TestModal />)
    const first = document.querySelector<HTMLButtonElement>('[data-testid="first"]')!
    expect(document.activeElement).toBe(first)
  })

  it('invokes onEscape when the user presses Escape', () => {
    const onEscape = vi.fn()
    render(<TestModal onEscape={onEscape} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('restores focus to the previously-active element on unmount', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Trigger'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { unmount } = render(<TestModal />)
    expect(document.activeElement).not.toBe(trigger)

    unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('wraps Tab from the last focusable back to the first', () => {
    render(<TestModal />)
    const last = document.querySelector<HTMLButtonElement>('[data-testid="last"]')!
    const first = document.querySelector<HTMLButtonElement>('[data-testid="first"]')!
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('wraps Shift+Tab from the first focusable back to the last', () => {
    render(<TestModal />)
    const last = document.querySelector<HTMLButtonElement>('[data-testid="last"]')!
    const first = document.querySelector<HTMLButtonElement>('[data-testid="first"]')!
    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })
})
