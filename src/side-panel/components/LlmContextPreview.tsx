import { useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  Download,
} from 'lucide-react'
import { buildJsonExport } from '@codegen/export/json-export'
import { buildLlmContext } from '@codegen/export/llm-context'
import {
  estimateTokens,
  renderLlmContextCompact,
  renderLlmContextJson,
} from '@codegen/export/llm-context-render'
import { buildPromptDocument, renderPromptMarkdown } from '@codegen/export/prompt-export'
import { COPY_FEEDBACK_MS } from '@shared/constants'
import type { RecordedAction } from '@shared/types/action'
import type { FrameworkId, LlmContextFormat, LlmContextTask } from '@shared/types/generated'
import type { Session } from '@shared/types/session'

interface LlmContextPreviewProps {
  session: Session
  steps: RecordedAction[]
  framework: FrameworkId
}

type ContextResult =
  | { ok: true; text: string; slug: string; tokens: number; savedPercent: number }
  | { ok: false; message: string }

const FORMAT_LABELS: Record<LlmContextFormat, string> = {
  compact: 'Compact lines',
  json: 'Minified JSON',
}

const TASK_LABELS: Record<LlmContextTask, string> = {
  codegen: 'Write test code',
  heal: 'Repair locators',
  both: 'Both',
}

const FILE_EXTENSIONS: Record<LlmContextFormat, string> = { compact: 'llm.txt', json: 'llm.json' }
const MIME_TYPES: Record<LlmContextFormat, string> = {
  compact: 'text/plain',
  json: 'application/json',
}
const PERCENT = 100

const SELECT_CLASS =
  'rounded-md border border-border bg-bg px-2 py-1 text-xs text-text focus:outline-none focus:ring-1 focus:ring-accent'

export function LlmContextPreview({ session, steps, framework }: LlmContextPreviewProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [shouldRedact, setShouldRedact] = useState(true)
  const [format, setFormat] = useState<LlmContextFormat>('compact')
  const [task, setTask] = useState<LlmContextTask>('both')
  const [isCopied, setIsCopied] = useState(false)

  // Rendering walks the whole IR pipeline (twice, for the XML comparison), so only pay while expanded.
  const result = useMemo<ContextResult | null>(() => {
    if (!isOpen) return null
    try {
      const payload = buildJsonExport(session, steps)
      const ctx = buildLlmContext(payload, { task, framework, redactSecrets: shouldRedact })
      const text = format === 'json' ? renderLlmContextJson(ctx) : renderLlmContextCompact(ctx)
      const xml = renderPromptMarkdown(
        buildPromptDocument(payload, { mode: 'prompt', framework, redactSecrets: shouldRedact }),
      )
      return {
        ok: true,
        text,
        slug: ctx.flow,
        tokens: estimateTokens(text),
        savedPercent: Math.round((1 - text.length / xml.length) * PERCENT),
      }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }, [isOpen, session, steps, framework, shouldRedact, format, task])

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
    const blob = new Blob([result.text], { type: MIME_TYPES[format] })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${result.slug}.${FILE_EXTENSIONS[format]}`
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
        <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
        Local LLM context
        <span className="ml-auto font-normal normal-case tracking-normal text-text-subtle">
          low-token · for small models
        </span>
      </button>

      {isOpen && (
        <div className="space-y-2 border-t border-border px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Context format"
              value={format}
              onChange={(e) => setFormat(e.target.value as LlmContextFormat)}
              className={SELECT_CLASS}
            >
              {(Object.keys(FORMAT_LABELS) as LlmContextFormat[]).map((id) => (
                <option key={id} value={id}>
                  {FORMAT_LABELS[id]}
                </option>
              ))}
            </select>
            <select
              aria-label="Context task"
              value={task}
              onChange={(e) => setTask(e.target.value as LlmContextTask)}
              className={SELECT_CLASS}
            >
              {(Object.keys(TASK_LABELS) as LlmContextTask[]).map((id) => (
                <option key={id} value={id}>
                  {TASK_LABELS[id]}
                </option>
              ))}
            </select>
            <div className="ml-auto flex shrink-0 gap-1">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!result?.ok}
                aria-label="Download LLM context"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-3 w-3" aria-hidden="true" />
                Download
              </button>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!result?.ok}
                aria-label="Copy LLM context"
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
            {result?.ok && (
              <span aria-label="Context size" className="text-xs text-text-subtle">
                ~{result.tokens} tokens ·{' '}
                {result.savedPercent >= 0
                  ? `${result.savedPercent}% smaller`
                  : `${-result.savedPercent}% larger`}{' '}
                than the XML prompt
              </span>
            )}
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
              aria-label="LLM context preview"
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
