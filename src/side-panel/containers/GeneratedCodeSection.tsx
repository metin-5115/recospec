import { memo } from 'react'
import { Code2, Download, Info, RefreshCcw } from 'lucide-react'
import { useSessionStore } from '../sessionStore'
import type { LocatorValidationResult } from '@shared/types/messages'
import type { ReplayState } from '../hooks/useSession'
import { CodePreview } from '../components/CodePreview'
import { LocatorValidationPanel } from '../components/LocatorValidationPanel'

interface GeneratedCodeSectionProps {
  isActive: boolean
  hasSteps: boolean
  onGenerate: () => void
  onExportZip: (sessionId: string) => void | Promise<void>
  validationResults: LocatorValidationResult[]
  validationDurationMs: number
  validationError: string | null
  validationTruncated: number | undefined
  isValidating: boolean
  onValidate: () => void | Promise<void>
  onShowLocator: (result: LocatorValidationResult) => void | Promise<void>
  onUseFallback: (result: LocatorValidationResult, index: number) => void | Promise<void>
  replayState: ReplayState
  onReplay: () => void | Promise<void>
  onAbortReplay: () => void | Promise<void>
}

/** The generated files with the stale-steps notice, locator validation and replay controls. */
export const GeneratedCodeSection = memo(function GeneratedCodeSection({
  isActive,
  hasSteps,
  onGenerate,
  onExportZip,
  validationResults,
  validationDurationMs,
  validationError,
  validationTruncated,
  isValidating,
  onValidate,
  onShowLocator,
  onUseFallback,
  replayState,
  onReplay,
  onAbortReplay,
}: GeneratedCodeSectionProps) {
  const generatedCode = useSessionStore((s) => s.generatedCode)
  const stepsDirty = useSessionStore((s) => s.stepsDirty)
  const activeSession = useSessionStore((s) => s.activeSession)
  if (!generatedCode) return null
  return (
    <div className="border-t border-border">
      {stepsDirty && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 bg-warning-soft px-5 py-2 text-xs text-warning"
        >
          <span className="inline-flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Steps modified — regenerate code to apply changes
          </span>
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex items-center gap-1 rounded-md bg-warning px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:opacity-90"
          >
            <RefreshCcw className="h-3 w-3" aria-hidden="true" />
            Re-generate
          </button>
        </div>
      )}
      <div className="flex items-center justify-between bg-bg-elevated/40 px-5 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
          Generated Code
        </span>
        {activeSession && (
          <button
            onClick={() => void onExportZip(activeSession.sessionId)}
            className="inline-flex items-center gap-1.5 rounded-md bg-bg px-2.5 py-1 text-xs font-medium text-text-muted shadow-sm transition-colors hover:bg-accent hover:text-white"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            Export ZIP
          </button>
        )}
      </div>
      <CodePreview
        code={generatedCode}
        onValidate={() => void onValidate()}
        isValidating={isValidating}
        validateDisabled={isActive || !hasSteps}
        onReplay={() => void onReplay()}
        onAbortReplay={() => void onAbortReplay()}
        isReplaying={replayState.running}
        replayDisabled={isActive || !hasSteps}
        replaySummary={
          !replayState.running &&
          replayState.totalSteps > 0 &&
          (replayState.passed > 0 || replayState.failed > 0 || replayState.skipped > 0)
            ? {
                passed: replayState.passed,
                failed: replayState.failed,
                total: replayState.totalSteps,
              }
            : null
        }
      />
      {(isValidating || validationResults.length > 0 || validationError) && (
        <LocatorValidationPanel
          results={validationResults}
          durationMs={validationDurationMs}
          isRunning={isValidating}
          error={validationError}
          truncated={validationTruncated}
          onRefresh={() => void onValidate()}
          onShow={(r) => void onShowLocator(r)}
          onUseFallback={(r, idx) => void onUseFallback(r, idx)}
        />
      )}
    </div>
  )
})
