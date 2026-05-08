import { useState } from 'react'
import {
  AlertCircle,
  ChevronRight,
  Circle,
  CircleDot,
  Code2,
  Download,
  FileJson,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Square,
  CheckCircle2,
} from 'lucide-react'
import { useSession } from './hooks/useSession'
import { StepList } from './components/StepList'
import { SessionList } from './components/SessionList'
import { CodePreview } from './components/CodePreview'
import { AssertionBuilder } from './components/AssertionBuilder'
import { FrameworkPicker } from './components/FrameworkPicker'
import { MethodPreview } from './components/MethodPreview'

type Tab = 'recording' | 'history'

export function SidePanelApp() {
  const [activeTab, setActiveTab] = useState<Tab>('recording')

  const {
    activeSession,
    isRecording,
    isPaused,
    isStarting,
    steps,
    sessions,
    generatedCode,
    codeGenError,
    isProbeActive,
    assertionContext,
    selectedFramework,
    setSelectedFramework,
    includeMocks,
    setIncludeMocks,
    methodRenames,
    renameMethod,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    generateCode,
    deleteStep,
    toggleAssertionProbe,
    cancelAssertionBuilder,
    addAssertion,
    loadSession,
    handleDeleteSession,
    handleRenameSession,
    exportJson,
    exportZip,
  } = useSession()

  const isActive = isRecording || isPaused

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold tracking-tight text-gradient-accent">
            PlayForge
          </span>
          <StatusBadge isRecording={isRecording} isPaused={isPaused} />
        </div>

        <div className="flex items-center gap-2">
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
          <StepList steps={steps} onDeleteStep={deleteStep} />
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
          />
        )}
      </main>

      {activeTab === 'recording' && steps.length > 0 && !isActive && (
        <div className="space-y-3 border-t border-border bg-bg-elevated/40 px-5 py-4">
          <FrameworkPicker value={selectedFramework} onChange={setSelectedFramework} />
          <MethodPreview
            steps={steps}
            startUrl={activeSession?.startUrl ?? 'about:blank'}
            renames={methodRenames}
            onRename={renameMethod}
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
          <div className="flex gap-2">
            <button
              onClick={generateCode}
              className="group inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-accent px-3.5 py-2.5 text-sm font-semibold text-white shadow-accent-glow transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Generate {selectedFramework === 'cypress' ? 'Cypress' : 'Playwright'}</span>
              <ChevronRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
            {activeSession && (
              <button
                onClick={() => void exportJson(activeSession.sessionId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:border-border-strong hover:bg-bg-muted hover:text-text"
                title="Export raw session data as JSON"
              >
                <FileJson className="h-4 w-4" aria-hidden="true" />
                JSON
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
          <CodePreview code={generatedCode} />
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
          onConfirm={addAssertion}
          onCancel={cancelAssertionBuilder}
        />
      )}
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
