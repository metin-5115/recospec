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
const BATCH_MAX_BUFFER_BYTES = 64 * 1024 * 1024

/**
 * Reads a JSON list of sources from stdin and prints one `{ok, error?}` entry
 * per source, so any number of files is validated in a single Python process.
 */
const BATCH_SCRIPT = [
  'import ast, json, sys',
  'sources = json.loads(sys.stdin.buffer.read().decode("utf-8"))',
  'out = []',
  'for src in sources:',
  '    try:',
  '        ast.parse(src)',
  '        out.append({"ok": True})',
  '    except SyntaxError as exc:',
  '        out.append({"ok": False, "error": f"SyntaxError: {exc.msg} (line {exc.lineno})"})',
  'sys.stdout.write(json.dumps(out))',
].join('\n')

interface BatchEntry {
  ok: boolean
  error?: string
}

let cachedInterpreter: string | null | undefined

/** Probe for an interpreter that responds to `--version` without erroring. Cached per process. */
function findInterpreter(): string | null {
  if (cachedInterpreter !== undefined) return cachedInterpreter
  cachedInterpreter = null
  for (const candidate of CANDIDATE_INTERPRETERS) {
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' })
    if (probe.status === 0) {
      cachedInterpreter = candidate
      break
    }
  }
  return cachedInterpreter
}

function isBatchEntries(value: unknown, expected: number): value is BatchEntry[] {
  return (
    Array.isArray(value) &&
    value.length === expected &&
    value.every((entry) => typeof entry === 'object' && entry !== null && 'ok' in entry)
  )
}

/**
 * Parse several Python sources with one `ast.parse` run per source inside a
 * single interpreter process (the process start dominates the cost). Results
 * keep the input order. When no Python interpreter is on PATH every entry is
 * `{ ok: true, skipped: true }` so the suite still passes without Python.
 */
export function validatePythonSources(sources: readonly string[]): PythonValidationResult[] {
  if (sources.length === 0) return []
  const interpreter = findInterpreter()
  if (!interpreter) {
    return sources.map(() => ({ ok: true, interpreter: '', skipped: true }))
  }
  const result = spawnSync(interpreter, ['-c', BATCH_SCRIPT], {
    input: JSON.stringify(sources),
    encoding: 'utf-8',
    maxBuffer: BATCH_MAX_BUFFER_BYTES,
  })
  let parsed: unknown = null
  if (result.status === 0) {
    try {
      parsed = JSON.parse(result.stdout)
    } catch {
      parsed = null
    }
  }
  if (!isBatchEntries(parsed, sources.length)) {
    const error = (result.stderr || result.stdout || 'unknown error').trim()
    return sources.map(() => ({ ok: false, interpreter, error }))
  }
  return parsed.map((entry) =>
    entry.ok ? { ok: true, interpreter } : { ok: false, interpreter, error: entry.error },
  )
}

/**
 * Parse one string of Python source via `ast.parse`.
 * Returns `{ ok: true }` on success, `{ ok: false, error }` on syntax error,
 * or `{ ok: true, skipped: true }` when no Python interpreter is on PATH.
 */
export function validatePythonSource(source: string): PythonValidationResult {
  return validatePythonSources([source])[0] as PythonValidationResult
}
