import { useSession } from './hooks/useSession'
import { StepList } from './components/StepList'
import { CodePreview } from './components/CodePreview'

export function SidePanelApp() {
  const {
    isRecording,
    isStarting,
    steps,
    generatedCode,
    codeGenError,
    startRecording,
    stopRecording,
    generateCode,
    deleteStep,
  } = useSession()

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-gray-900">PlayForge</span>
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tracking-wide ${
              isRecording ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isRecording ? 'animate-pulse bg-red-500' : 'bg-gray-400'
              }`}
            />
            {isRecording ? 'REC' : 'IDLE'}
          </span>
        </div>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isStarting}
          className={`rounded px-3 py-1.5 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
            isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isStarting ? 'Starting…' : isRecording ? 'Stop' : 'Start Recording'}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <StepList steps={steps} onDeleteStep={deleteStep} />
      </main>

      {steps.length > 0 && !isRecording && (
        <div className="space-y-2 border-t border-gray-200 px-4 py-3">
          <button
            onClick={generateCode}
            className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            Generate Playwright TS Code
          </button>
          {codeGenError && (
            <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-600">{codeGenError}</p>
          )}
        </div>
      )}

      {generatedCode && <CodePreview code={generatedCode} />}

      {steps.length > 0 && (
        <footer className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
          {steps.length} step{steps.length !== 1 ? 's' : ''} recorded
        </footer>
      )}
    </div>
  )
}
