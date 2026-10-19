import { useCallback } from 'react'
import { useSessionStore } from './sessionStore'
import { useSession } from './hooks/useSession'
import { AssertionBuilder } from './components/AssertionBuilder'
import { SessionDiffModal } from './components/SessionDiffModal'
import { RecordingHeader } from './containers/RecordingHeader'
import { RecordingBanners } from './containers/RecordingBanners'
import { TabBar } from './containers/TabBar'
import { StepsTab } from './containers/StepsTab'
import { HistoryTab } from './containers/HistoryTab'
import { GeneratePanel } from './containers/GeneratePanel'
import { GeneratedCodeSection } from './containers/GeneratedCodeSection'
import { StepCountFooter } from './containers/StepCountFooter'
import type { Session } from '@shared/types/session'

/**
 * The side panel shell: it wires the per-concern hooks to one container per tab and never
 * subscribes to the step list itself, so a newly recorded step re-renders only the containers
 * that show steps (list, banner, tab count, footer) — not the header, the Generate panel or the
 * history.
 */
export function SidePanelApp() {
  const activeTab = useSessionStore((s) => s.activeTab)
  const setActiveTab = useSessionStore((s) => s.setActiveTab)
  const hasSteps = useSessionStore((s) => s.steps.length > 0)

  const {
    activeSession,
    isRecording,
    isPaused,
    isStarting,
    generatedCode,
    isProbeActive,
    assertionContext,
    methodRenames,
    renameMethod,
    testData,
    setTestData,
    composedModes,
    templateModes,
    setComposedMode,
    setTemplateMode,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    generateCode,
    toggleAssertionProbe,
    requestThumbnail,
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

  const handleLoadSession = useCallback(
    (session: Session) => {
      void loadSession(session)
      setActiveTab('recording')
    },
    [loadSession, setActiveTab],
  )
  const handleAcceptIteration = useCallback(() => void acceptIteration(), [acceptIteration])
  const handleDismissIteration = useCallback(() => void dismissIteration(), [dismissIteration])
  const handleValidate = useCallback(() => void validateLocators(), [validateLocators])
  const handleShowLocator = useCallback(showLocatorOnPage, [showLocatorOnPage])
  const handleUseFallback = useCallback(useFallbackLocator, [useFallbackLocator])
  const handleReplay = useCallback(() => void replayCurrentSession(), [replayCurrentSession])
  const handleAbortReplay = useCallback(() => void abortReplay(), [abortReplay])

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <RecordingHeader
        isRecording={isRecording}
        isPaused={isPaused}
        isStarting={isStarting}
        isProbeActive={isProbeActive}
        onToggleAssertionProbe={toggleAssertionProbe}
        onStart={startRecording}
        onPause={pauseRecording}
        onResume={resumeRecording}
        onStop={stopRecording}
      />

      <RecordingBanners
        activeSession={activeSession}
        isRecording={isRecording}
        isPaused={isPaused}
        iterationSuggestion={iterationSuggestion}
        onAcceptIteration={handleAcceptIteration}
        onDismissIteration={handleDismissIteration}
      />

      <TabBar activeTab={activeTab} onChange={setActiveTab} />

      <main className="flex-1 overflow-y-auto">
        {activeTab === 'recording' ? (
          <StepsTab
            isActive={isActive}
            flashStepId={lastStepId}
            replayState={replayState}
            validationResults={validationResults}
            composedModes={composedModes}
            templateModes={templateModes}
            onSetComposedMode={setComposedMode}
            onSetTemplateMode={setTemplateMode}
            onAddAssertion={openAssertionForStep}
          />
        ) : (
          <HistoryTab
            onLoad={handleLoadSession}
            onDelete={handleDeleteSession}
            onRename={handleRenameSession}
            onExportJson={exportJson}
            onExportZip={exportZip}
            onCompare={openDiff}
          />
        )}
      </main>

      {activeTab === 'recording' && hasSteps && !isActive && (
        <GeneratePanel
          methodRenames={methodRenames}
          onRenameMethod={renameMethod}
          testData={testData}
          onTestDataChange={setTestData}
          onGenerate={generateCode}
          onExportJson={exportJson}
        />
      )}

      {generatedCode && activeTab === 'recording' && (
        <GeneratedCodeSection
          isActive={isActive}
          hasSteps={hasSteps}
          onGenerate={generateCode}
          onExportZip={exportZip}
          validationResults={validationResults}
          validationDurationMs={validationDurationMs}
          validationError={validationError}
          validationTruncated={validationTruncated}
          isValidating={isValidating}
          onValidate={handleValidate}
          onShowLocator={handleShowLocator}
          onUseFallback={handleUseFallback}
          replayState={replayState}
          onReplay={handleReplay}
          onAbortReplay={handleAbortReplay}
        />
      )}

      {activeTab === 'recording' && <StepCountFooter />}

      {assertionContext && (
        <AssertionBuilder
          suggestions={assertionContext.suggestions}
          locatorBundle={assertionContext.locatorBundle}
          elementSnapshot={assertionContext.elementSnapshot}
          pageMetadata={assertionContext.pageMetadata}
          screenshotDataUrl={assertionContext.screenshotDataUrl}
          onScreenshotSelected={requestThumbnail}
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
