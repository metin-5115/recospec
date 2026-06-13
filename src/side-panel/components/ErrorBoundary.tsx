import { Component, type ReactNode, type ErrorInfo } from 'react'
import { logger } from '@shared/logger'
import {
  ContentScriptMissingError,
  IndexedDBQuotaError,
  RecospecError,
  ServiceWorkerColdError,
} from '@shared/errors'
import { useSessionStore } from '../sessionStore'

interface Props {
  children: ReactNode
  /**
   * Called by the boundary after a successful recovery so the parent can
   * clear any matching async-error state in `useSession`. Without this, the
   * component would re-throw immediately on next render.
   */
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('[UI] Component crashed', error, info.componentStack)
  }

  private resetBoundary = (): void => {
    // Clear any async error from the store first — otherwise SidePanelApp
    // would re-throw on next render and the boundary would catch again.
    useSessionStore.getState().setAsyncError(null)
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  private retryServiceWorker = async (): Promise<void> => {
    try {
      await chrome.runtime.sendMessage({ type: 'PING' })
    } catch (err) {
      logger.error('[UI] Service worker still cold after PING', err)
    }
    this.resetBoundary()
  }

  private navigateToHistory = (): void => {
    useSessionStore.getState().setActiveTab('history')
    this.resetBoundary()
  }

  private reloadTab = async (tabId: number): Promise<void> => {
    try {
      await chrome.tabs.reload(tabId)
    } catch (err) {
      logger.error('[UI] chrome.tabs.reload failed', err)
    }
    this.resetBoundary()
  }

  private renderForError(error: Error): ReactNode {
    if (error instanceof ServiceWorkerColdError) {
      return (
        <ErrorShell title="Background worker asleep" message={error.userMessage} code={error.code}>
          <button
            type="button"
            onClick={() => void this.retryServiceWorker()}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Click Record again
          </button>
        </ErrorShell>
      )
    }

    if (error instanceof IndexedDBQuotaError) {
      return (
        <ErrorShell title="Storage full" message={error.userMessage} code={error.code}>
          <button
            type="button"
            onClick={this.navigateToHistory}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Clear old sessions
          </button>
        </ErrorShell>
      )
    }

    if (error instanceof ContentScriptMissingError) {
      return (
        <ErrorShell
          title="Cannot reach this tab"
          message={error.userMessage}
          code={error.code}
          detail={`Tab ID: ${error.tabId}`}
        >
          <button
            type="button"
            onClick={() => void this.reloadTab(error.tabId)}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Reload tab
          </button>
        </ErrorShell>
      )
    }

    return (
      <ErrorShell title="Something went wrong" message="Please reload the side panel.">
        <button
          onClick={() => location.reload()}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Reload
        </button>
      </ErrorShell>
    )
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return this.renderForError(this.state.error)
    }
    return this.props.children
  }
}

/** Static export so tests can assert behavior without spinning up the boundary. */
export function isRecospecError(err: unknown): err is RecospecError {
  return err instanceof RecospecError
}

interface ErrorShellProps {
  title: string
  message: string
  code?: string
  detail?: string
  children: ReactNode
}

function ErrorShell({ title, message, code, detail, children }: ErrorShellProps) {
  return (
    <div
      role="alert"
      className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="max-w-sm text-sm text-gray-700">{message}</p>
      {detail && <p className="text-xs text-gray-500">{detail}</p>}
      {children}
      {code && <p className="text-[10px] uppercase tracking-wider text-gray-400">code: {code}</p>}
    </div>
  )
}
