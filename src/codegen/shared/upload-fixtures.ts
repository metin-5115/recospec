import type { GeneratedFile, IRStep } from '../ir/types'

/** Folder, relative to the generated project root, that holds the files an upload step picks. */
export const UPLOAD_FIXTURES_DIR = 'fixtures'

/** Placeholder path (`fixtures/<name>`) for each file recorded on an upload step. */
export function uploadFixturePaths(step: IRStep): string[] {
  return (step.upload?.fileNames ?? []).map((name) => `${UPLOAD_FIXTURES_DIR}/${name}`)
}

/** True when the step needs a list rather than a single file (several files, or a `multiple` input). */
export function isMultiUpload(step: IRStep): boolean {
  return (step.upload?.multiple ?? false) || (step.upload?.fileNames.length ?? 0) > 1
}

/** True when any step in the list (or in any method body) uploads a file. */
export function hasUploadStep(steps: readonly IRStep[]): boolean {
  return steps.some((s) => s.action === 'upload' && (s.upload?.fileNames.length ?? 0) > 0)
}

/** `fixtures/.gitkeep` for flows that upload files, so the folder the steps read from exists in git. */
export function renderFixturesScaffold(options: { hasUploads?: boolean }): GeneratedFile[] {
  return options.hasUploads ? [{ filename: `${UPLOAD_FIXTURES_DIR}/.gitkeep`, content: '' }] : []
}
