import { useRecording } from './useRecording'
import { useStepEditing } from './useStepEditing'
import { useAssertions } from './useAssertions'
import { useCodegen } from './useCodegen'
import { useValidation } from './useValidation'
import { useReplay } from './useReplay'
import { useSessionHistory } from './useSessionHistory'

export type { ReplayResultStatus, ReplayState } from './useReplay'

/**
 * Everything the side panel needs, assembled from one hook per concern. Each of
 * those reads the store through narrow selectors, so a component that needs only
 * one concern (the popup needs just `useRecordingStatus`) should call that hook
 * directly instead of this one.
 */
export function useSession() {
  const recording = useRecording()
  const stepEditing = useStepEditing()
  const assertions = useAssertions()
  const codegen = useCodegen()
  const validation = useValidation()
  const replay = useReplay()
  const history = useSessionHistory()

  return {
    ...recording,
    ...stepEditing,
    ...assertions,
    ...codegen,
    ...validation,
    ...replay,
    ...history,
  }
}
