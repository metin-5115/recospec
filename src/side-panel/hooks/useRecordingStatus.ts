import { useEffect } from 'react'
import { useSessionStore } from '../sessionStore'
import { onUIMessage } from '@shared/messaging/listen'

/**
 * The slice of recording state a surface needs just to show "REC / PAUSE / IDLE".
 * The popup uses this on its own so it does not pull in the side panel's
 * codegen, export and replay code.
 */
export function useRecordingStatus() {
  const state = useSessionStore((s) => s.activeSession?.state)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

  useEffect(
    () =>
      onUIMessage((message) => {
        if (message.type === 'SESSION_STATE_CHANGED') setActiveSession(message.session)
      }),
    [setActiveSession],
  )

  return { isRecording: state === 'recording', isPaused: state === 'paused' }
}
