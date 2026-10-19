import { buildJsonExport } from '@codegen/export/json-export'
import { buildZipExport } from '@codegen/export/zip-export'
import { slugifyFilename } from '@shared/slug'
import type { GeneratedCode } from '@shared/types/generated'
import type { RecordedAction } from '@shared/types/action'
import type { Session } from '@shared/types/session'

/** Hands `blob` to the browser as a file download (the only place the panel touches the DOM for it). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportFilename(session: Session, extension: string): string {
  return `${slugifyFilename(session.name)}_${session.sessionId.slice(0, 8)}.${extension}`
}

export function downloadJsonExport(session: Session, actions: RecordedAction[]): void {
  const payload = buildJsonExport(session, actions)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  saveBlob(blob, exportFilename(session, 'json'))
}

export async function downloadZipExport(session: Session, code: GeneratedCode): Promise<void> {
  saveBlob(await buildZipExport(session, code), exportFilename(session, 'zip'))
}
