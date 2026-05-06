import { Component, type ReactNode, type ErrorInfo } from 'react'
import { logger } from '@shared/logger'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('[UI] Component crashed', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm font-medium text-gray-800">Something went wrong, please reload.</p>
          <button
            onClick={() => location.reload()}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
