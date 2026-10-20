import { memo, useMemo } from 'react'
import { AlertCircle, AlertTriangle, ChevronRight, FileJson, Sparkles } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useSessionStore } from '../sessionStore'
import { classifyStep } from '@shared/locator-quality'
import type { TestDataConfig } from '@codegen/ir/types'
import { FrameworkPicker } from '../components/FrameworkPicker'
import { MethodPreview } from '../components/MethodPreview'
import { PromptPreview } from '../components/PromptPreview'
import { LlmContextPreview } from '../components/LlmContextPreview'
import { TestDataPanel } from '../components/TestDataPanel'
import { AdvancedSection } from '../components/AdvancedSection'

interface GeneratePanelProps {
  methodRenames: Record<string, string>
  onRenameMethod: (key: string, value: string) => void
  testData: TestDataConfig
  onTestDataChange: (next: TestDataConfig) => void
  onGenerate: () => void
  onExportJson: (sessionId: string) => void | Promise<void>
}

/** Framework, options and the Generate button. Reads its preferences straight from the store. */
export const GeneratePanel = memo(function GeneratePanel({
  methodRenames,
  onRenameMethod,
  testData,
  onTestDataChange,
  onGenerate,
  onExportJson,
}: GeneratePanelProps) {
  const steps = useSessionStore((s) => s.steps)
  const activeSession = useSessionStore((s) => s.activeSession)
  const codeGenError = useSessionStore((s) => s.codeGenError)
  const prefs = useSessionStore(
    useShallow((s) => ({
      selectedFramework: s.selectedFramework,
      bddEnabled: s.bddEnabled,
      includeMocks: s.includeMocks,
      selfHealing: s.selfHealing,
      finalStateAssertion: s.finalStateAssertion,
      autoWaitEnabled: s.autoWaitEnabled,
      outputSelection: s.outputSelection,
    })),
  )
  const actions = useSessionStore(
    useShallow((s) => ({
      setSelectedFramework: s.setSelectedFramework,
      setBddEnabled: s.setBddEnabled,
      setIncludeMocks: s.setIncludeMocks,
      setSelfHealing: s.setSelfHealing,
      setFinalStateAssertion: s.setFinalStateAssertion,
      setAutoWaitEnabled: s.setAutoWaitEnabled,
      setOutputSelection: s.setOutputSelection,
    })),
  )
  const { selectedFramework, bddEnabled, includeMocks, selfHealing, finalStateAssertion } = prefs
  const { autoWaitEnabled, outputSelection } = prefs
  const {
    setSelectedFramework,
    setBddEnabled,
    setIncludeMocks,
    setSelfHealing,
    setFinalStateAssertion,
    setAutoWaitEnabled,
    setOutputSelection,
  } = actions

  // Count steps whose captured locator is below par so a stopped recording can
  // surface a single "N of M steps have locator issues" summary.
  const qualityIssueCount = useMemo(
    () => steps.filter((s) => classifyStep(s).level !== 'ok').length,
    [steps],
  )

  return (
    <div className="space-y-3 border-t border-border bg-bg-elevated/40 px-5 py-4">
      {qualityIssueCount > 0 && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-text"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          <p className="flex-1">
            <span className="font-semibold">
              {qualityIssueCount} of {steps.length} step{steps.length === 1 ? '' : 's'}
            </span>{' '}
            {qualityIssueCount === 1 ? 'has' : 'have'} a locator issue — look for the highlighted
            steps above. Adding a <span className="font-mono">data-testid</span> to those elements
            produces the most reliable tests.
          </p>
        </div>
      )}
      <FrameworkPicker
        value={selectedFramework}
        onChange={setSelectedFramework}
        bddEnabled={bddEnabled}
        onBddChange={setBddEnabled}
      />
      <div className="flex gap-2">
        <button
          onClick={onGenerate}
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
      </div>
      <AdvancedSection>
        <MethodPreview
          steps={steps}
          startUrl={activeSession?.startUrl ?? 'about:blank'}
          renames={methodRenames}
          onRename={onRenameMethod}
        />
        <TestDataPanel
          steps={steps}
          startUrl={activeSession?.startUrl ?? 'about:blank'}
          testData={testData}
          onChange={onTestDataChange}
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
            checked={selfHealing}
            onChange={(e) => setSelfHealing(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-accent"
          />
          <span>
            Runtime self-healing
            <span className="ml-1 text-text-subtle">
              (Playwright, Cypress · Selenium: fallback suggestions)
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={finalStateAssertion}
            onChange={(e) => setFinalStateAssertion(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-accent"
          />
          <span>
            Add final-state assertion
            <span className="ml-1 text-text-subtle">(URL, when you added none)</span>
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
        <fieldset className="space-y-1.5">
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-text-subtle">
            Output includes
          </legend>
          {(
            [
              ['pageObjects', 'Page objects', 'one class per page'],
              ['test', 'Test spec', '.feature when BDD is on, else the scenario'],
              ['scaffold', 'Project scaffold', 'config, package.json/pom.xml'],
            ] as const
          ).map(([key, label, hint]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 text-xs text-text-muted"
            >
              <input
                type="checkbox"
                checked={outputSelection[key]}
                onChange={(e) =>
                  setOutputSelection({ ...outputSelection, [key]: e.target.checked })
                }
                className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-accent"
              />
              <span>
                {label}
                <span className="ml-1 text-text-subtle">({hint})</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex">
          {activeSession && (
            <button
              onClick={() => void onExportJson(activeSession.sessionId)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:border-border-strong hover:bg-bg-muted hover:text-text"
              title="Export raw session data as JSON for the recospec CLI (recospec add session.json)"
              aria-label="Export JSON for CLI"
            >
              <FileJson className="h-4 w-4" aria-hidden="true" />
              JSON for CLI
            </button>
          )}
        </div>
        {activeSession && (
          <PromptPreview session={activeSession} steps={steps} framework={selectedFramework} />
        )}
        {activeSession && (
          <LlmContextPreview session={activeSession} steps={steps} framework={selectedFramework} />
        )}
      </AdvancedSection>
      {codeGenError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{codeGenError}</span>
        </p>
      )}
    </div>
  )
})
