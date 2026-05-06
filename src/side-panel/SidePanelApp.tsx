import { useState } from 'react'
import { useSession } from './hooks/useSession'
import { StepList } from './components/StepList'
import { SessionList } from './components/SessionList'
import { CodePreview } from './components/CodePreview'
import { AssertionBuilder } from './components/AssertionBuilder'

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
    <div className="flex h-screen flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-gray-900">PlayForge</span>
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tracking-wide ${
              isRecording
                ? 'bg-red-100 text-red-700'
                : isPaused
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-500'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isRecording ? 'animate-pulse bg-red-500' : isPaused ? 'bg-amber-500' : 'bg-gray-400'
              }`}
            />
            {isRecording ? 'REC' : isPaused ? 'PAUSE' : 'IDLE'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isRecording && (
            <button
              onClick={toggleAssertionProbe}
              title={
                isProbeActive ? 'Cancel assertion mode' : 'Add assertion by clicking an element'
              }
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                isProbeActive
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {isProbeActive ? '✓ Pick element…' : '✓ Assert'}
            </button>
          )}

          {isActive && (
            <>
              {isRecording ? (
                <button
                  onClick={pauseRecording}
                  className="rounded px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 transition-colors"
                >
                  Pause
                </button>
              ) : (
                <button
                  onClick={resumeRecording}
                  className="rounded px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 transition-colors"
                >
                  Resume
                </button>
              )}
              <button
                onClick={stopRecording}
                className="rounded px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Stop
              </button>
            </>
          )}

          {!isActive && (
            <button
              onClick={startRecording}
              disabled={isStarting}
              className="rounded px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isStarting ? 'Starting…' : 'Start Recording'}
            </button>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('recording')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            activeTab === 'recording'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Recording
          {steps.length > 0 && (
            <span className="ml-1.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">
              {steps.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          History
          {sessions.length > 0 && (
            <span className="ml-1.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">
              {sessions.length}
            </span>
          )}
        </button>
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
        <div className="space-y-2 border-t border-gray-200 px-4 py-3">
          <div className="flex gap-2">
            <button
              onClick={generateCode}
              className="flex-1 rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Generate Playwright TS Code
            </button>
            {activeSession && (
              <button
                onClick={() => void exportJson(activeSession.sessionId)}
                className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                title="Export raw session data as JSON"
              >
                JSON
              </button>
            )}
          </div>
          {codeGenError && (
            <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-600">{codeGenError}</p>
          )}
        </div>
      )}

      {generatedCode && activeTab === 'recording' && (
        <div className="border-t border-gray-200">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-xs font-medium text-gray-500">Generated Code</span>
            {activeSession && (
              <button
                onClick={() => void exportZip(activeSession.sessionId)}
                className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
              >
                Export ZIP
              </button>
            )}
          </div>
          <CodePreview code={generatedCode} />
        </div>
      )}

      {activeTab === 'recording' && steps.length > 0 && (
        <footer className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
          {steps.length} step{steps.length !== 1 ? 's' : ''} recorded
        </footer>
      )}

      {assertionContext && (
        <AssertionBuilder
          suggestions={assertionContext.suggestions}
          locatorBundle={assertionContext.locatorBundle}
          elementSnapshot={assertionContext.elementSnapshot}
          pageMetadata={assertionContext.pageMetadata}
          onConfirm={addAssertion}
          onCancel={cancelAssertionBuilder}
        />
      )}
    </div>
  )
}
