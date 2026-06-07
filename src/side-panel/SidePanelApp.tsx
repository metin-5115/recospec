import { useEffect, useState } from 'react'
import { useSessionStore } from './sessionStore'
import type { RecordedAction, NetworkPayload } from '@shared/types/action'
import {
  AlertCircle,
  ChevronRight,
  Circle,
  CircleDot,
  Code2,
  Download,
  FileJson,
  GitBranch,
  Info,
  Loader2,
  Pause,
  Play,
  RefreshCcw,
  Sparkles,
  Square,
  CheckCircle2,
  X,
} from 'lucide-react'
import { useSession } from './hooks/useSession'
import { StepList } from './components/StepList'
import { SessionList } from './components/SessionList'
import { CodePreview } from './components/CodePreview'
import { AssertionBuilder } from './components/AssertionBuilder'
import { FrameworkPicker } from './components/FrameworkPicker'
import { MethodPreview } from './components/MethodPreview'
import { TestDataPanel } from './components/TestDataPanel'
import { LocatorValidationPanel } from './components/LocatorValidationPanel'
import { SessionDiffModal } from './components/SessionDiffModal'
import { HelpMenu } from './components/HelpMenu'

export function SidePanelApp() {
  const activeTab = useSessionStore((s) => s.activeTab)
  const setActiveTab = useSessionStore((s) => s.setActiveTab)

  const {
    activeSession,
    isRecording,
    isPaused,
    isStarting,
    steps,
    sessions,
    generatedCode,
    codeGenError,
    stepsDirty,
    isProbeActive,
    assertionContext,
    selectedFramework,
    setSelectedFramework,
    autoWaitEnabled,
    setAutoWaitEnabled,
    bddEnabled,
    setBddEnabled,
    includeMocks,
    setIncludeMocks,
    methodRenames,
    renameMethod,
    testData,
    setTestData,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    generateCode,
    deleteStep,
    reorderStep,
    updateStep,
    setStepLocator,
    toggleAssertionProbe,
    cancelAssertionBuilder,
    addAssertion,
    loadSession,
    handleDeleteSession,
    handleRenameSession,
    exportJson,
    exportZip,
    validationResults,
    validationDurationMs,
    validationError,
    validationTruncated,
    isValidating,
    validateLocators,
    showLocatorOnPage,
    useFallbackLocator,
    iterationSuggestion,
    acceptIteration,
    dismissIteration,
    diffSelection,
    openDiff,
    closeDiff,
    lastStepId,
    asyncError,
    replayState,
    replayCurrentSession,
    abortReplay,
    openAssertionForStep,
  } = useSession()

  // Surface runtime errors that the render-time ErrorBoundary cannot catch
  // on its own. The boundary clears the store's `asyncError` after the user
  // invokes its recovery CTA (see ErrorBoundary.resetBoundary).
  if (asyncError) {
    throw asyncError
  }

  const isActive = isRecording || isPaused
  const lastStep = steps.length > 0 ? steps[steps.length - 1] : null
  const lastStepSummary = lastStep ? formatLastStep(lastStep) : null

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-accent text-sm font-bold text-white shadow-accent-glow">
            R
          </span>
          <span className="text-base font-semibold tracking-tight text-gradient-accent">
            Recospec
          </span>
          <StatusBadge isRecording={isRecording} isPaused={isPaused} />
        </div>

        <div className="flex items-center gap-2">
          <HelpMenu />

          {isRecording && (
            <button
              onClick={toggleAssertionProbe}
              title={
                isProbeActive ? 'Cancel assertion mode' : 'Add assertion by clicking an element'
              }
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isProbeActive
                  ? 'bg-warning-soft text-warning'
                  : 'bg-bg-muted text-text-muted hover:bg-bg-elevated hover:text-text'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {isProbeActive ? 'Pick element…' : 'Assert'}
            </button>
          )}

          {isActive && (
            <>
              {isRecording ? (
                <button
                  onClick={pauseRecording}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-bg-muted px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg-elevated hover:text-text"
                >
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  Pause
                </button>
              ) : (
                <button
                  onClick={resumeRecording}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  Resume
                </button>
              )}
              <button
                onClick={stopRecording}
                className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-rose-500"
              >
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                Stop
              </button>
            </>
          )}

          {!isActive && (
            <button
              onClick={startRecording}
              disabled={isStarting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-rose-500 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Starting…
                </>
              ) : (
                <>
                  <Circle className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  Record
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {isActive && activeSession && (
        <LiveRecordingBanner
          startUrl={activeSession.startUrl}
          startedAt={activeSession.startedAt}
          stepCount={steps.length}
          isPaused={isPaused}
        />
      )}

      {isRecording && lastStepSummary && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Last recorded step"
          className="flex items-center gap-2 border-b border-border bg-bg-elevated/40 px-5 py-1.5 text-[11px] text-text-muted"
        >
          <span className="font-semibold uppercase tracking-wider text-text-subtle">Last</span>
          <span className="font-mono text-text">{lastStepSummary.action}</span>
          {lastStepSummary.target && (
            <span className="truncate font-mono text-text-muted" title={lastStepSummary.target}>
              {lastStepSummary.target}
            </span>
          )}
        </div>
      )}

      {iterationSuggestion && (
        <div
          role="status"
          aria-label="Iteration suggested"
          className="flex items-start gap-2 border-b border-accent/30 bg-accent-soft px-5 py-2 text-xs text-text"
        >
          <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold text-text">
              Looks like an iteration of{' '}
              <span className="font-mono text-accent">{iterationSuggestion.parentName}</span>
            </p>
            <p className="text-text-muted">
              Last recorded{' '}
              {new Date(iterationSuggestion.parentTimestamp).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · link as{' '}
              <span className="font-mono">v{iterationSuggestion.parentIterationNumber + 1}</span>?
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void acceptIteration()}
              className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:opacity-90"
            >
              Link as v{iterationSuggestion.parentIterationNumber + 1}
            </button>
            <button
              type="button"
              onClick={() => void dismissIteration()}
              className="rounded-md p-1 text-text-muted hover:bg-bg-muted hover:text-text"
              aria-label="Dismiss iteration suggestion"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-border bg-bg-elevated/40 px-3 pb-0 pt-2">
        <TabButton
          label="Recording"
          count={steps.length}
          active={activeTab === 'recording'}
          onClick={() => setActiveTab('recording')}
        />
        <TabButton
          label="History"
          count={sessions.length}
          active={activeTab === 'history'}
          onClick={() => setActiveTab('history')}
        />
      </div>

      <main className="flex-1 overflow-y-auto">
        {activeTab === 'recording' ? (
          <StepList
            steps={steps}
            reorderable={!isActive}
            isFirstRun={!isActive && !activeSession && sessions.length === 0}
            flashStepId={lastStepId}
            onDeleteStep={(id) => void deleteStep(id)}
            onReorderStep={(from, to) => void reorderStep(from, to)}
            onUpdateStep={(id, patch) => void updateStep(id, patch)}
            onPickLocator={(id, candidate) => void setStepLocator(id, candidate)}
            replayResults={replayState.results}
            replayRunningActionId={replayState.currentActionId}
            validationResults={validationResults}
            onAddAssertion={!isActive ? openAssertionForStep : undefined}
          />
        ) : (
          <SessionList
            sessions={sessions}
            activeSessionId={activeSession?.sessionId ?? null}
            onLoad={(session) => {
              void loadSession(session)
              setActiveTab('recording')
            }}
            onDelete={handleDeleteSession}
            onRename={handleRenameSession}
            onExportJson={exportJson}
            onExportZip={exportZip}
            onCompare={(a, b) => void openDiff(a, b)}
          />
        )}
      </main>

      {activeTab === 'recording' && steps.length > 0 && !isActive && (
        <div className="space-y-3 border-t border-border bg-bg-elevated/40 px-5 py-4">
          <FrameworkPicker
            value={selectedFramework}
            onChange={setSelectedFramework}
            bddEnabled={bddEnabled}
            onBddChange={setBddEnabled}
          />
          <MethodPreview
            steps={steps}
            startUrl={activeSession?.startUrl ?? 'about:blank'}
            renames={methodRenames}
            onRename={renameMethod}
          />
          <TestDataPanel
            steps={steps}
            startUrl={activeSession?.startUrl ?? 'about:blank'}
            testData={testData}
            onChange={setTestData}
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={includeMocks}
              onChange={(e) => setIncludeMocks(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-accent"
            />
            <span>
              Include mocks for captured network requests
              <span className="ml-1 text-text-subtle">(page.route)</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={autoWaitEnabled}
              onChange={(e) => setAutoWaitEnabled(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-accent"
              aria-label="Auto-detect waits"
            />
            <span>
              Auto-detect waits
              <span className="ml-1 text-text-subtle">(networkidle, spinners)</span>
            </span>
          </label>
          <div className="flex gap-2">
            <button
              onClick={generateCode}
              className="group inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-accent px-3.5 py-2.5 text-sm font-semibold text-white shadow-accent-glow transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>
                Generate{' '}
                {selectedFramework === 'cypress'
                  ? 'Cypress'
                  : selectedFramework === 'selenium-py'
                    ? 'Selenium Py'
                    : selectedFramework === 'selenium-java'
                      ? 'Selenium Java'
                      : 'Playwright'}
              </span>
              <ChevronRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
            {activeSession && (
              <button
                onClick={() => void exportJson(activeSession.sessionId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:border-border-strong hover:bg-bg-muted hover:text-text"
                title="Export raw session data as JSON for the recospec CLI (recospec add session.json)"
                aria-label="Export JSON for CLI"
              >
                <FileJson className="h-4 w-4" aria-hidden="true" />
                JSON for CLI
              </button>
            )}
          </div>
          {codeGenError && (
            <p className="flex items-start gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{codeGenError}</span>
            </p>
          )}
        </div>
      )}

      {generatedCode && activeTab === 'recording' && (
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
                onClick={generateCode}
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
                onClick={() => void exportZip(activeSession.sessionId)}
                className="inline-flex items-center gap-1.5 rounded-md bg-bg px-2.5 py-1 text-xs font-medium text-text-muted shadow-sm transition-colors hover:bg-accent hover:text-white"
              >
                <Download className="h-3 w-3" aria-hidden="true" />
                Export ZIP
              </button>
            )}
          </div>
          <CodePreview
            code={generatedCode}
            onValidate={() => void validateLocators()}
            isValidating={isValidating}
            validateDisabled={isActive || steps.length === 0}
            onReplay={() => void replayCurrentSession()}
            onAbortReplay={() => void abortReplay()}
            isReplaying={replayState.running}
            replayDisabled={isActive || steps.length === 0}
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
              onRefresh={() => void validateLocators()}
              onShow={(r) => void showLocatorOnPage(r)}
              onUseFallback={(r, idx) => void useFallbackLocator(r, idx)}
            />
          )}
        </div>
      )}

      {activeTab === 'recording' && steps.length > 0 && (
        <footer className="border-t border-border px-5 py-2 text-xs text-text-subtle">
          {steps.length} step{steps.length !== 1 ? 's' : ''} recorded
        </footer>
      )}

      {assertionContext && (
        <AssertionBuilder
          suggestions={assertionContext.suggestions}
          locatorBundle={assertionContext.locatorBundle}
          elementSnapshot={assertionContext.elementSnapshot}
          pageMetadata={assertionContext.pageMetadata}
          screenshotDataUrl={assertionContext.screenshotDataUrl}
          onConfirm={(suggestion, bundle, snapshot, page, customExpected) =>
            void addAssertion(
              suggestion,
              bundle,
              snapshot,
              page,
              customExpected,
              assertionContext.afterActionId,
            )
          }
          onCancel={cancelAssertionBuilder}
        />
      )}

      {diffSelection && (
        <SessionDiffModal
          sessionA={diffSelection.sessionA}
          actionsA={diffSelection.actionsA}
          sessionB={diffSelection.sessionB}
          actionsB={diffSelection.actionsB}
          onClose={closeDiff}
        />
      )}
    </div>
  )
}

interface LiveRecordingBannerProps {
  startUrl: string
  startedAt: number
  stepCount: number
  isPaused: boolean
}

function LiveRecordingBanner({
  startUrl,
  startedAt,
  stepCount,
  isPaused,
}: LiveRecordingBannerProps) {
  const [elapsedSec, setElapsedSec] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
  )
  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(id)
  }, [startedAt])

  let host = startUrl
  let path = ''
  try {
    const u = new URL(startUrl)
    host = u.host
    path = u.pathname === '/' ? '' : u.pathname
  } catch {
    /* keep raw url */
  }
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
  const ss = String(elapsedSec % 60).padStart(2, '0')
  const dotClass = isPaused ? 'fill-warning text-warning' : 'fill-danger text-danger animate-pulse'
  const dotLabel = isPaused ? 'Recording paused' : 'Recording'

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${dotLabel} on ${host}${path}, ${stepCount} steps, ${mm} minutes ${ss} seconds`}
      className="flex items-center gap-3 border-b border-border bg-bg-elevated/40 px-5 py-1.5 text-[11px] text-text-muted"
    >
      <CircleDot className={`h-2.5 w-2.5 ${dotClass}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-mono text-text" title={startUrl}>
        {host}
        {path && <span className="text-text-muted">{path}</span>}
      </span>
      <span className="shrink-0 font-mono tabular-nums text-text-muted">
        <span className="font-semibold text-text">{stepCount}</span> step
        {stepCount === 1 ? '' : 's'}
      </span>
      <span className="shrink-0 font-mono tabular-nums text-text-muted" aria-hidden="true">
        {mm}:{ss}
      </span>
    </div>
  )
}

interface StatusBadgeProps {
  isRecording: boolean
  isPaused: boolean
}

function StatusBadge({ isRecording, isPaused }: StatusBadgeProps) {
  const label = isRecording ? 'REC' : isPaused ? 'PAUSE' : 'IDLE'
  const palette = isRecording
    ? 'bg-danger-soft text-danger'
    : isPaused
      ? 'bg-warning-soft text-warning'
      : 'bg-bg-muted text-text-muted'
  const dotPalette = isRecording
    ? 'fill-danger text-danger animate-pulse'
    : isPaused
      ? 'fill-warning text-warning'
      : 'fill-text-subtle text-text-subtle'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${palette}`}
    >
      <CircleDot className={`h-2.5 w-2.5 ${dotPalette}`} aria-hidden="true" />
      {label}
    </span>
  )
}

interface LastStepSummary {
  action: string
  target: string | null
}

function formatLastStep(step: RecordedAction): LastStepSummary {
  if (step.type === 'network') {
    const np = (step.payload ?? {}) as Partial<NetworkPayload>
    const method = (np.method ?? 'GET').toUpperCase()
    let path = np.url ?? ''
    try {
      if (np.url) path = new URL(np.url).pathname
    } catch {
      /* keep raw url */
    }
    return { action: 'network', target: `${method} ${path}`.trim() || null }
  }
  const primary = step.target?.primaryLocator
  if (primary) {
    const selector =
      typeof primary.selector === 'string' ? primary.selector : JSON.stringify(primary.selector)
    return { action: step.type, target: selector }
  }
  return { action: step.type, target: null }
}

interface TabButtonProps {
  label: string
  count: number
  active: boolean
  onClick: () => void
}

function TabButton({ label, count, active, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium transition-all ${
        active
          ? 'bg-bg text-text shadow-[0_-2px_0_0_var(--color-accent)_inset]'
          : 'text-text-muted hover:bg-bg/60 hover:text-text'
      }`}
    >
      {label}
      {count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            active ? 'bg-accent-soft text-accent' : 'bg-bg-muted text-text-muted'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}
