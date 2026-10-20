import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AdvancedSection } from './AdvancedSection'
import { PREF_KEYS } from '@shared/constants'

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

const renderSection = () =>
  render(
    <AdvancedSection>
      <p>inside</p>
    </AdvancedSection>,
  )

describe('AdvancedSection', () => {
  it('starts collapsed and keeps its content out of the DOM', () => {
    renderSection()
    const toggle = screen.getByRole('button', { name: /advanced/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('inside')).toBeNull()
  })

  it('opens and closes, reflecting the state in aria-expanded', () => {
    renderSection()
    const toggle = screen.getByRole('button', { name: /advanced/i })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('inside')).toBeTruthy()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('points aria-controls at the region it reveals', () => {
    renderSection()
    const toggle = screen.getByRole('button', { name: /advanced/i })
    fireEvent.click(toggle)
    const region = screen.getByRole('region', { name: /advanced/i })
    expect(toggle.getAttribute('aria-controls')).toBe(region.id)
  })

  it('remembers the choice for the next time the panel opens', () => {
    const first = renderSection()
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }))
    expect(window.localStorage.getItem(PREF_KEYS.advancedOpen)).toBe('true')
    first.unmount()

    renderSection()
    expect(screen.getByRole('button', { name: /advanced/i }).getAttribute('aria-expanded')).toBe(
      'true',
    )
    expect(screen.getByText('inside')).toBeTruthy()
  })

  it('is a real button, so Enter and Space open it without extra key handling', () => {
    renderSection()
    const toggle = screen.getByRole('button', { name: /advanced/i })
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle.getAttribute('type')).toBe('button')
  })
})
