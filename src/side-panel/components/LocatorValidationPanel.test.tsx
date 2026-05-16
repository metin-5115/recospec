import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

import { LocatorValidationPanel } from './LocatorValidationPanel'
import type { LocatorValidationResult } from '@shared/types/messages'

function makeResult(overrides: Partial<LocatorValidationResult>): LocatorValidationResult {
  return {
    actionId: 'a1',
    index: 0,
    label: 'Submit button',
    primary: {
      strategy: 'testid',
      selector: 'submit',
      status: 'matched',
      matchCount: 1,
    },
    fallbacks: [],
    ...overrides,
  }
}

describe('LocatorValidationPanel', () => {
  it('renders matched/total summary and matched row with Show me button', () => {
    const onShow = vi.fn()
    render(
      <LocatorValidationPanel
        results={[makeResult({})]}
        durationMs={234}
        isRunning={false}
        error={null}
        onRefresh={vi.fn()}
        onShow={onShow}
        onUseFallback={vi.fn()}
      />,
    )
    expect(screen.getByText(/1\/1 locators matched in 234ms/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText(/Show Submit button on page/))
    expect(onShow).toHaveBeenCalledTimes(1)
  })

  it('shows "Use fallback" only when primary fails and a working fallback exists', () => {
    const onUseFallback = vi.fn()
    const result = makeResult({
      primary: { strategy: 'css', selector: '#x', status: 'missing', matchCount: 0 },
      fallbacks: [
        { strategy: 'css', selector: '.miss', status: 'missing', matchCount: 0 },
        { strategy: 'css', selector: '.hit', status: 'matched', matchCount: 1 },
      ],
    })
    render(
      <LocatorValidationPanel
        results={[result]}
        durationMs={100}
        isRunning={false}
        error={null}
        onRefresh={vi.fn()}
        onShow={vi.fn()}
        onUseFallback={onUseFallback}
      />,
    )
    fireEvent.click(screen.getByLabelText(/Switch Submit button to fallback locator/))
    expect(onUseFallback).toHaveBeenCalledWith(result, 1)
  })

  it('hides "Use fallback" when no fallback matches', () => {
    const result = makeResult({
      primary: { strategy: 'css', selector: '#x', status: 'missing', matchCount: 0 },
      fallbacks: [{ strategy: 'css', selector: '.miss', status: 'missing', matchCount: 0 }],
    })
    render(
      <LocatorValidationPanel
        results={[result]}
        durationMs={100}
        isRunning={false}
        error={null}
        onRefresh={vi.fn()}
        onShow={vi.fn()}
        onUseFallback={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText(/Switch .* fallback/)).toBeNull()
  })

  it('renders a URL mismatch warning when any result is flagged', () => {
    render(
      <LocatorValidationPanel
        results={[makeResult({ urlMismatch: true })]}
        durationMs={50}
        isRunning={false}
        error={null}
        onRefresh={vi.fn()}
        onShow={vi.fn()}
        onUseFallback={vi.fn()}
      />,
    )
    expect(screen.getByText(/Active tab no longer matches the recorded origin/)).toBeTruthy()
  })

  it('renders the loading state and disables Refresh while running', () => {
    render(
      <LocatorValidationPanel
        results={[]}
        durationMs={0}
        isRunning={true}
        error={null}
        onRefresh={vi.fn()}
        onShow={vi.fn()}
        onUseFallback={vi.fn()}
      />,
    )
    expect(screen.getByText(/Validating locators on the active tab/)).toBeTruthy()
    const refresh = screen.getByRole('button', { name: /Refresh/i })
    expect((refresh as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders the error message when validation fails', () => {
    render(
      <LocatorValidationPanel
        results={[]}
        durationMs={0}
        isRunning={false}
        error="No active browser tab."
        onRefresh={vi.fn()}
        onShow={vi.fn()}
        onUseFallback={vi.fn()}
      />,
    )
    expect(screen.getByText('No active browser tab.')).toBeTruthy()
  })

  it('shows truncation hint when targets exceeded the cap', () => {
    render(
      <LocatorValidationPanel
        results={[makeResult({})]}
        durationMs={100}
        isRunning={false}
        error={null}
        truncated={150}
        onRefresh={vi.fn()}
        onShow={vi.fn()}
        onUseFallback={vi.fn()}
      />,
    )
    expect(screen.getByText(/Validated first 1 of 150/)).toBeTruthy()
  })

  it('fires onRefresh when the refresh button is clicked', () => {
    const onRefresh = vi.fn()
    render(
      <LocatorValidationPanel
        results={[makeResult({})]}
        durationMs={50}
        isRunning={false}
        error={null}
        onRefresh={onRefresh}
        onShow={vi.fn()}
        onUseFallback={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))
    expect(onRefresh).toHaveBeenCalled()
  })
})
