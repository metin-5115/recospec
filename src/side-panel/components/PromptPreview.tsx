import { useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
} from 'lucide-react'
import { buildJsonExport } from '@codegen/export/json-export'
import { buildPromptDocument, renderPromptMarkdown } from '@codegen/export/prompt-export'
import { COPY_FEEDBACK_MS } from '@shared/constants'
import type { RecordedAction } from '@shared/types/action'
import type { FrameworkId } from '@shared/types/generated'
import type { Session } from '@shared/types/session'

interface PromptPreviewProps {
  session: Session
  steps: RecordedAction[]
  framework: FrameworkId
}

type PromptResult = { ok: true; text: string; slug: string } | { ok: false; message: string }

export function PromptPreview({ session, steps, framework }: PromptPreviewProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [shouldRedact, setShouldRedact] = useState(true)
  const [isCopied, setIsCopied] = useState(false)

  // Rendering walks the whole IR pipeline, so only pay for it while expanded.
  const result = useMemo<PromptResult | null>(() => {
    if (!isOpen) return null
    try {
      const payload = buildJsonExport(session, steps)
      const doc = buildPromptDocument(payload, {
        mode: 'prompt',
        framework,
        redactSecrets: shouldRedact,
      })
      return { ok: true, text: renderPromptMarkdown(doc), slug: doc.flowSlug }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }, [isOpen, session, steps, framework, shouldRedact])

  const handleCopy = () => {
    if (!result?.ok) return
    navigator.clipboard
      .writeText(result.text)
      .then(() => {
        setIsCopied(true)
        window.setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS)
      })
      .catch(() => setIsCopied(false))
  }

  const handleDownload = () => {
    if (!result?.ok) return
    const blob = new Blob([result.text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${result.slug}.prompt.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const Chevron = isOpen ? ChevronDown : ChevronRight

  return (
    <section className="rounded-lg border border-border bg-bg">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text"
      >
        <Chevron className="h-3.5 w-3.5" aria-hidden="true" />
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        Claude prompt
        <span className="ml-auto font-normal normal-case tracking-normal text-text-subtle">
          XML · paste into Claude Code
        </span>
      </button>

      {isOpen && (
        <div className="space-y-2 border-t border-border px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={shouldRedact}
                onChange={(e) => setShouldRedact(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-accent"
              />
              Redact sensitive values
            </label>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!result?.ok}
                aria-label="Download prompt"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-3 w-3" aria-hidden="true" />
                Download
              </button>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!result?.ok}
                aria-label="Copy prompt"
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isCopied
                    ? 'bg-success-soft text-success'
                    : 'text-text-muted hover:bg-bg-muted hover:text-text'
                }`}
              >
                {isCopied ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Copy className="h-3 w-3" aria-hidden="true" />
                )}
                {isCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {!shouldRedact && (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Redaction is off — passwords and tokens appear in plain text.</span>
            </p>
          )}

          {result?.ok === false && (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{result.message}</span>
            </p>
          )}

          {result?.ok && (
            <pre
              aria-label="Prompt preview"
              className="max-h-72 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100"
            >
              <code>{result.text}</code>
            </pre>
          )}
        </div>
      )}
    </section>
  )
}
