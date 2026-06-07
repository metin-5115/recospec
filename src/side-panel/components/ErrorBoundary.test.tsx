import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'

afterEach(cleanup)

import { ErrorBoundary } from './ErrorBoundary'
import {
  ContentScriptMissingError,
  IndexedDBQuotaError,
  ServiceWorkerColdError,
} from '@shared/errors'
import { useSessionStore } from '../sessionStore'

const sendMessageMock = vi.fn().mockResolvedValue(undefined)
const reloadMock = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  sendMessageMock.mockClear()
  reloadMock.mockClear()
  // Minimal Chrome stub. Cast through unknown so we don't have to satisfy
  // the entire @types/chrome surface in a unit test.
  ;(globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage: sendMessageMock },
    tabs: { reload: reloadMock },
  }
  useSessionStore.setState({ activeTab: 'recording', asyncError: null })
  // ErrorBoundary logs via console.error in componentDidCatch — silence to
  // keep test output readable; React itself also dumps the caught tree.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function Thrower({ error }: { error: Error }): ReactElement {
  throw error
}

describe('ErrorBoundary — context-aware rendering', () => {
  it('renders the generic fallback for plain Errors', () => {
    render(
      <ErrorBoundary>
        <Thrower error={new Error('boom')} />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/Something went wrong/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy()
  })

  it('renders the ServiceWorkerColdError branch with a retry CTA', async () => {
    render(
      <ErrorBoundary>
        <Thrower error={new ServiceWorkerColdError()} />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/asleep/i)).toBeTruthy()
    expect(screen.getByText(/code: SERVICE_WORKER_COLD/i)).toBeTruthy()
    const button = screen.getByRole('button', { name: /Click Record again/i })
    fireEvent.click(button)
    // Allow the async retry handler to settle.
    await Promise.resolve()
    await Promise.resolve()
    expect(sendMessageMock).toHaveBeenCalledWith({ type: 'PING' })
  })

  it('renders the IndexedDBQuotaError branch and navigates to History on click', () => {
    render(
      <ErrorBoundary>
        <Thrower error={new IndexedDBQuotaError()} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Storage full')).toBeTruthy()
    expect(screen.getByText(/code: INDEXEDDB_QUOTA/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Clear old sessions/i }))
    expect(useSessionStore.getState().activeTab).toBe('history')
  })

  it('renders the ContentScriptMissingError branch with tabId + reload', async () => {
    render(
      <ErrorBoundary>
        <Thrower error={new ContentScriptMissingError(99)} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Cannot reach this tab')).toBeTruthy()
    expect(screen.getByText(/Tab ID: 99/i)).toBeTruthy()
    expect(screen.getByText(/code: CONTENT_SCRIPT_MISSING/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Reload tab/i }))
    await Promise.resolve()
    await Promise.resolve()
    expect(reloadMock).toHaveBeenCalledWith(99)
  })

  it('clears the store asyncError on recovery so the panel can re-render', () => {
    useSessionStore.setState({ asyncError: new IndexedDBQuotaError() })
    render(
      <ErrorBoundary>
        <Thrower error={new IndexedDBQuotaError()} />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Clear old sessions/i }))
    expect(useSessionStore.getState().asyncError).toBeNull()
  })
})
