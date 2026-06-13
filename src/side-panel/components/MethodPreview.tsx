import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { normalizeActions } from '@codegen/normalizer/action-normalizer'
import { groupIntoPages } from '@codegen/planner/page-grouper'
import type { RecordedAction } from '@shared/types/action'
import type { IRPage } from '@codegen/ir/types'

export interface MethodPreviewItem {
  pageClassName: string
  originalName: string
  signature: string
}

interface MethodPreviewProps {
  steps: RecordedAction[]
  startUrl: string
  renames: Record<string, string>
  onRename: (key: string, value: string) => void
}

function buildPages(steps: RecordedAction[], startUrl: string): IRPage[] {
  if (steps.length === 0) return []
  const { flatSteps } = normalizeActions(steps)
  return groupIntoPages(flatSteps, startUrl)
}

function renderSignature(name: string, params: string[], paramTypes: string[] | undefined): string {
  const parts = params.map((p, i) => `${p}: ${paramTypes?.[i] ?? 'string'}`)
  return `${name}(${parts.join(', ')})`
}

export function MethodPreview({ steps, startUrl, renames, onRename }: MethodPreviewProps) {
  const items = useMemo<MethodPreviewItem[]>(() => {
    const pages = buildPages(steps, startUrl)
    const acc: MethodPreviewItem[] = []
    for (const page of pages) {
      for (const m of page.inferredMethods ?? []) {
        acc.push({
          pageClassName: page.className,
          originalName: m.name,
          signature: renderSignature(m.name, m.params, m.paramTypes),
        })
      }
    }
    return acc
  }, [steps, startUrl])

  if (items.length === 0) return null

  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-bg-elevated/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        <span>Inferred methods · editable</span>
      </div>
      <ul className="space-y-1">
        {items.map((item) => {
          const key = `${item.pageClassName}.${item.originalName}`
          const value = renames[key] ?? item.originalName
          return (
            <li key={key} className="flex items-center gap-2 text-xs">
              <span
                className="shrink-0 truncate font-mono text-[10px] text-text-subtle"
                title={item.pageClassName}
              >
                {item.pageClassName}.
              </span>
              <input
                type="text"
                value={value}
                onChange={(e) => onRename(key, e.target.value)}
                aria-label={`Rename method ${item.originalName} on ${item.pageClassName}`}
                className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1 font-mono text-[11px] text-text focus:border-accent focus:outline-none"
              />
              <span
                className="shrink-0 truncate font-mono text-[10px] text-text-subtle"
                title={item.signature}
              >
                {item.signature.slice(item.originalName.length)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
