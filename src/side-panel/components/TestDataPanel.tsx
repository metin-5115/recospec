import { useEffect, useMemo, useRef } from 'react'
import { KeyRound, Lock, Unlock } from 'lucide-react'
import { normalizeActions } from '@codegen/normalizer/action-normalizer'
import { groupIntoPages } from '@codegen/planner/page-grouper'
import { buildDefaultTestDataConfig } from '@codegen/planner/test-data-resolver'
import { deriveFillVariants, withFillVariants } from '@codegen/planner/fill-variants'
import {
  isSensitiveField,
  getParameterName,
  getEnvVarName,
} from '@codegen/planner/sensitive-detector'
import { SECRET_PARAM_DEFAULT_VALUE } from '@shared/constants'
import type { RecordedAction } from '@shared/types/action'
import type { IRElement, IRStep, TestDataConfig, TestDataParam } from '@codegen/ir/types'

interface TestDataPanelProps {
  steps: RecordedAction[]
  startUrl: string
  testData: TestDataConfig
  onChange: (next: TestDataConfig) => void
}

interface PanelEntry extends TestDataParam {
  detected: boolean
  sourceLabel: string
}

interface FillInfo {
  elements: IRElement[]
  /** Every step of the recording in order — fills of one field with different values need them. */
  flatSteps: IRStep[]
}

function collectFillElements(steps: RecordedAction[], startUrl: string): FillInfo {
  if (steps.length === 0) return { elements: [], flatSteps: [] }
  const { flatSteps } = normalizeActions(steps)
  const pages = groupIntoPages(flatSteps, startUrl)
  const out: IRElement[] = []
  const seen = new Set<string>()
  for (const page of pages) {
    for (const step of page.steps) {
      if (step.action !== 'fill' || !step.element) continue
      if (seen.has(step.element.name)) continue
      seen.add(step.element.name)
      out.push(step.element)
    }
  }
  return { elements: out, flatSteps }
}

export function TestDataPanel({ steps, startUrl, testData, onChange }: TestDataPanelProps) {
  // Auto-seed: when sensitive fields appear in the recording but the user
  // hasn't picked them up in the panel yet, hydrate the config so the panel
  // shows them on first render.
  const initializedRef = useRef(false)
  const fillInfo = useMemo(() => collectFillElements(steps, startUrl), [steps, startUrl])
  const fillElements = fillInfo.elements
  // A password typed with a different value (a failed login) reads its own env var.
  const variants = useMemo(() => deriveFillVariants(fillInfo.flatSteps), [fillInfo])
  const effectiveParams = useMemo(
    () => withFillVariants(testData, fillInfo.flatSteps)?.params ?? testData.params,
    [testData, fillInfo],
  )

  useEffect(() => {
    if (initializedRef.current) return
    if (fillElements.length === 0) return
    if (testData.params.length > 0) {
      initializedRef.current = true
      return
    }
    const seeded = withFillVariants(buildDefaultTestDataConfig(fillElements), fillInfo.flatSteps)
    if (seeded && seeded.params.length > 0) {
      onChange(seeded)
    }
    initializedRef.current = true
  }, [fillElements, fillInfo, testData.params.length, onChange])

  const entries = useMemo<PanelEntry[]>(() => {
    const byKey = new Map(effectiveParams.map((p) => [p.key, p]))
    const unusedBase = new Set(variants.filter((v) => v.replacesBase).map((v) => v.baseKey))
    const result: PanelEntry[] = []
    for (const el of fillElements) {
      if (unusedBase.has(el.name)) continue
      const detected = isSensitiveField(el)
      const existing = byKey.get(el.name)
      if (!detected && !existing) continue
      const name = existing?.name ?? getParameterName(el)
      result.push({
        key: el.name,
        name,
        isSecret: existing?.isSecret ?? detected,
        defaultValue: existing?.defaultValue ?? SECRET_PARAM_DEFAULT_VALUE,
        useEnvVar: existing?.useEnvVar ?? detected,
        envVarName: existing?.envVarName ?? getEnvVarName(name),
        detected,
        sourceLabel: el.elementSnapshot?.id ?? el.elementSnapshot?.fieldName ?? el.name,
      })
    }
    // Append manual overrides that don't correspond to a fill element (rare but supported).
    for (const p of effectiveParams) {
      if (!result.some((e) => e.key === p.key)) {
        result.push({ ...p, detected: false, sourceLabel: p.key })
      }
    }
    return result
  }, [fillElements, effectiveParams, variants])

  const updateParam = (key: string, patch: Partial<TestDataParam>): void => {
    const existing = testData.params.find((p) => p.key === key)
    const entry = entries.find((e) => e.key === key)
    if (!entry) return
    const merged: TestDataParam = {
      baseKey: entry.baseKey,
      valueFingerprint: entry.valueFingerprint,
      key,
      name: existing?.name ?? entry.name,
      isSecret: existing?.isSecret ?? entry.isSecret,
      defaultValue: existing?.defaultValue ?? entry.defaultValue,
      useEnvVar: existing?.useEnvVar ?? entry.useEnvVar,
      envVarName: existing?.envVarName ?? entry.envVarName,
      ...patch,
    }
    if (patch.name && !patch.envVarName) {
      merged.envVarName = getEnvVarName(patch.name)
    }
    const next = existing
      ? testData.params.map((p) => (p.key === key ? merged : p))
      : [...testData.params, merged]
    onChange({ params: next })
  }

  if (entries.length === 0) return null

  return (
    <div className="space-y-2 rounded-lg border border-border bg-bg-elevated/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        <KeyRound className="h-3 w-3" aria-hidden="true" />
        <span>Test Data · {entries.length}</span>
        <span className="ml-1 text-text-subtle normal-case">parameters</span>
      </div>
      <ul className="space-y-2">
        {entries.map((p) => (
          <li
            key={p.key}
            className="space-y-1.5 rounded-md border border-border bg-bg px-2 py-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateParam(p.key, { isSecret: !p.isSecret })}
                title={p.isSecret ? 'Marked sensitive' : 'Mark sensitive'}
                aria-label={p.isSecret ? 'Mark not sensitive' : 'Mark sensitive'}
                className={`inline-flex h-5 w-5 items-center justify-center rounded ${
                  p.isSecret ? 'bg-warning-soft text-warning' : 'bg-bg-muted text-text-subtle'
                }`}
              >
                {p.isSecret ? (
                  <Lock className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Unlock className="h-3 w-3" aria-hidden="true" />
                )}
              </button>
              <span
                className="shrink-0 truncate font-mono text-[10px] text-text-subtle"
                title={p.sourceLabel}
              >
                {p.baseKey ? `${p.baseKey} (other value)` : p.sourceLabel}
              </span>
              <input
                type="text"
                value={p.name}
                onChange={(e) => updateParam(p.key, { name: e.target.value })}
                aria-label={`Parameter name for ${p.sourceLabel}`}
                className="min-w-0 flex-1 rounded-md border border-border bg-bg-elevated px-2 py-1 font-mono text-[11px] text-text focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type={p.isSecret ? 'password' : 'text'}
                value={p.defaultValue}
                onChange={(e) => updateParam(p.key, { defaultValue: e.target.value })}
                placeholder="default value"
                aria-label={`Default value for ${p.name}`}
                className="min-w-0 flex-1 rounded-md border border-border bg-bg-elevated px-2 py-1 font-mono text-[11px] text-text focus:border-accent focus:outline-none"
              />
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] text-text-muted">
                <input
                  type="checkbox"
                  checked={p.useEnvVar}
                  onChange={(e) => updateParam(p.key, { useEnvVar: e.target.checked })}
                  className="h-3 w-3 cursor-pointer rounded border-border accent-accent"
                />
                <span title={`env var: ${p.envVarName}`}>use env var</span>
              </label>
            </div>
            {p.useEnvVar && (
              <p className="font-mono text-[10px] text-text-subtle">{p.envVarName}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
