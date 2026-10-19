import { useState } from 'react'
import { Check, Copy, Download, Loader2, Play, Repeat, X } from 'lucide-react'
import { COPY_FEEDBACK_MS } from '@shared/constants'
import type { GeneratedCode } from '@shared/types/generated'

interface CodePreviewProps {
  code: GeneratedCode
  onValidate?: () => void
  isValidating?: boolean
  validateDisabled?: boolean
  onReplay?: () => void
  onAbortReplay?: () => void
  isReplaying?: boolean
  replayDisabled?: boolean
  replaySummary?: { passed: number; failed: number; total: number } | null
}

export function CodePreview({
  code,
  onValidate,
  isValidating,
  validateDisabled,
  onReplay,
  onAbortReplay,
  isReplaying,
  replayDisabled,
  replaySummary,
}: CodePreviewProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [copied, setCopied] = useState(false)

  const activeFile = code.files[activeIndex]

  const handleDownload = () => {
    if (!activeFile) return
    const blob = new Blob([activeFile.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = activeFile.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(activeFile?.content ?? '').then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
    })
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 bg-bg-muted px-3 py-2">
        <div className="flex gap-1 overflow-x-auto">
          {code.files.map((file, i) => (
            <button
              key={file.filename}
              onClick={() => setActiveIndex(i)}
              className={`shrink-0 rounded-md px-2.5 py-1 font-mono text-xs transition-colors ${
                i === activeIndex
                  ? 'bg-bg text-text shadow-sm'
                  : 'text-text-muted hover:bg-bg/60 hover:text-text'
              }`}
            >
              {file.filename}
            </button>
          ))}
        </div>
        <div className="ml-2 flex shrink-0 gap-1">
          {onReplay && (
            <button
              onClick={isReplaying ? onAbortReplay : onReplay}
              disabled={!isReplaying && replayDisabled}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                isReplaying
                  ? 'bg-warning text-white hover:opacity-90'
                  : 'bg-bg text-text-muted hover:bg-bg/80 hover:text-text'
              }`}
              aria-label={isReplaying ? 'Abort replay' : 'Replay recorded steps on the active tab'}
              title={
                isReplaying
                  ? 'Cancel the in-flight replay'
                  : 'Re-run every recorded step against the page currently focused in your browser'
              }
            >
              {isReplaying ? (
                <X className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Repeat className="h-3 w-3" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {isReplaying
                  ? 'Stop'
                  : replaySummary
                    ? `Replay (${replaySummary.passed}/${replaySummary.total} ✓)`
                    : 'Replay Steps'}
              </span>
            </button>
          )}
          {onValidate && (
            <button
              onClick={onValidate}
              disabled={validateDisabled || isValidating}
              className="inline-flex items-center gap-1 rounded-md bg-gradient-accent px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              aria-label="Validate locators on the active tab"
              title="Validate every locator against the page currently focused in your browser"
            >
              {isValidating ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-3 w-3 fill-current" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{isValidating ? 'Testing…' : 'Test on Page'}</span>
            </button>
          )}
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-bg hover:text-text"
            aria-label="Download file"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            onClick={handleCopy}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              copied
                ? 'bg-success-soft text-success'
                : 'text-text-muted hover:bg-bg hover:text-text'
            }`}
            aria-label="Copy file contents"
          >
            {copied ? (
              <Check className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Copy className="h-3 w-3" aria-hidden="true" />
            )}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="max-h-72 overflow-auto bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100">
        <code>{activeFile?.content ?? ''}</code>
      </pre>
    </div>
  )
}
