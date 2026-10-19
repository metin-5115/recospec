import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PreferencesMenu } from './PreferencesMenu'
import { useSessionStore } from '../sessionStore'

afterEach(() => {
  cleanup()
  useSessionStore.setState({ captureNetwork: true })
})

describe('PreferencesMenu — network capture', () => {
  it('switches network capture off and on again', () => {
    render(<PreferencesMenu />)
    fireEvent.click(screen.getByRole('button'))
    const checkbox = screen.getByLabelText('Capture network requests') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    fireEvent.click(checkbox)
    expect(useSessionStore.getState().captureNetwork).toBe(false)
    fireEvent.click(checkbox)
    expect(useSessionStore.getState().captureNetwork).toBe(true)
  })
})
