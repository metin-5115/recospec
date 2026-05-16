import { spawnSync } from 'node:child_process'

export interface PythonValidationResult {
  ok: boolean
  /** Python interpreter that was used (or attempted). */
  interpreter: string
  /** Stderr from the failing parse, if any. Useful in test output. */
  error?: string
  /** Set when the Python interpreter could not be located on the host. */
  skipped?: boolean
}

const CANDIDATE_INTERPRETERS = ['python3', 'python', 'py']

/** Probe for an interpreter that responds to `--version` without erroring. */
function findInterpreter(): string | null {
  for (const candidate of CANDIDATE_INTERPRETERS) {
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' })
    if (probe.status === 0) return candidate
  }
  return null
}

/**
 * Parse a string of Python source via `python -c "import ast; ast.parse(...)"`.
 * Returns `{ ok: true }` on success, `{ ok: false, error }` on syntax error,
 * or `{ ok: true, skipped: true }` when no Python interpreter is on PATH (so
 * the suite still passes on machines without Python installed).
 */
export function validatePythonSource(source: string): PythonValidationResult {
  const interpreter = findInterpreter()
  if (!interpreter) {
    return { ok: true, interpreter: '', skipped: true }
  }
  const script = 'import ast, sys; ast.parse(sys.stdin.read())'
  const result = spawnSync(interpreter, ['-c', script], {
    input: source,
    encoding: 'utf-8',
  })
  if (result.status === 0) return { ok: true, interpreter }
  return {
    ok: false,
    interpreter,
    error: (result.stderr || result.stdout || 'unknown error').trim(),
  }
}
