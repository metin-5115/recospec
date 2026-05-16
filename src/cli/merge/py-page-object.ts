import { spawnSync } from 'node:child_process'

export interface PyMergeResult {
  source: string
  added: string[]
  skipped: string[]
  /** True when the regex fallback was used (no Python interpreter on PATH). */
  usedFallback: boolean
}

const CANDIDATE_INTERPRETERS = ['python3', 'python', 'py']

function findInterpreter(): string | null {
  for (const candidate of CANDIDATE_INTERPRETERS) {
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' })
    if (probe.status === 0) return candidate
  }
  return null
}

/**
 * Merge two Python page-object files. Strategy:
 *   1. Probe for a Python interpreter on PATH.
 *      - Found  → spawn `python -c "import ast; …"` to extract class member
 *        names from each file. This gets us a correct list of methods +
 *        class-level constants even when comments or strings happen to look
 *        like definitions.
 *      - Missing → fall back to a regex extractor. Catches >95% of real
 *        page-object shapes the renderer emits (`EMAIL_INPUT = (...)` and
 *        `def submit(self, ...):`); the cost is occasional false-positives
 *        on strings/comments which is acceptable for the "merge" path
 *        because the user is offered an explicit `m/o/s/r` choice.
 *   2. For each top-level member in `incoming` whose name does not already
 *      exist in `existing`, splice it into the existing file just before the
 *      class's trailing newline.
 *   3. Imports that the existing file is missing are appended after the
 *      last existing `import`/`from` line.
 */
export function mergePyPageObject(existing: string, incoming: string): PyMergeResult {
  const interpreter = findInterpreter()
  let existingNames: Set<string>
  let incomingMembers: Array<{ name: string; source: string }>
  let usedFallback = false

  if (interpreter) {
    const existingResult = extractWithAst(interpreter, existing)
    const incomingResult = extractWithAst(interpreter, incoming)
    if (!existingResult || !incomingResult) {
      // AST extraction failed (e.g. interpreter is broken or input is not
      // valid Python). Fall back rather than throw — merge is best-effort.
      usedFallback = true
      existingNames = new Set(extractWithRegex(existing).map((m) => m.name))
      incomingMembers = extractWithRegex(incoming)
    } else {
      existingNames = new Set(existingResult.names)
      incomingMembers = computeIncomingMembers(incoming, incomingResult.names)
    }
  } else {
    usedFallback = true
    existingNames = new Set(extractWithRegex(existing).map((m) => m.name))
    incomingMembers = extractWithRegex(incoming)
  }

  const added: string[] = []
  const skipped: string[] = []
  const toAppend: string[] = []
  for (const m of incomingMembers) {
    if (existingNames.has(m.name)) {
      skipped.push(m.name)
      continue
    }
    toAppend.push(m.source)
    added.push(m.name)
    existingNames.add(m.name)
  }

  const withMembers = spliceClassMembers(existing, toAppend)
  const merged = mergeImports(withMembers, incoming)

  return {
    source: merged.endsWith('\n') ? merged : merged + '\n',
    added,
    skipped,
    usedFallback,
  }
}

// ---------------------------------------------------------------------------
// AST extraction (python subprocess)
// ---------------------------------------------------------------------------

interface AstExtraction {
  names: string[]
}

const AST_EXTRACT_SCRIPT = [
  'import ast, sys, json',
  'tree = ast.parse(sys.stdin.read())',
  'names = []',
  'for node in tree.body:',
  '    if isinstance(node, ast.ClassDef):',
  '        for child in node.body:',
  '            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):',
  '                names.append(child.name)',
  '            elif isinstance(child, ast.Assign):',
  '                for tgt in child.targets:',
  '                    if isinstance(tgt, ast.Name):',
  '                        names.append(tgt.id)',
  '            elif isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name):',
  '                names.append(child.target.id)',
  'print(json.dumps(names))',
].join('\n')

function extractWithAst(interpreter: string, source: string): AstExtraction | null {
  const result = spawnSync(interpreter, ['-c', AST_EXTRACT_SCRIPT], {
    input: source,
    encoding: 'utf-8',
  })
  if (result.status !== 0) return null
  try {
    const parsed = JSON.parse((result.stdout || '').trim()) as unknown
    if (!Array.isArray(parsed)) return null
    return { names: parsed.filter((s): s is string => typeof s === 'string') }
  } catch {
    return null
  }
}

/**
 * Walk the incoming file line-by-line and split it into member chunks. Used
 * after AST extraction has given us the canonical name list; we re-discover
 * member boundaries here so we can splice raw source (preserving comments).
 */
function computeIncomingMembers(
  source: string,
  knownNames: string[],
): Array<{ name: string; source: string }> {
  const regexMembers = extractWithRegex(source)
  const knownSet = new Set(knownNames)
  return regexMembers.filter((m) => knownSet.has(m.name))
}

// ---------------------------------------------------------------------------
// Regex fallback
// ---------------------------------------------------------------------------

const METHOD_RE = /^( {4}|\t)(async\s+def|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/
const CONST_RE = /^( {4}|\t)([A-Z_][A-Z0-9_]*)\s*(?::\s*[^=]+)?=\s*/

/**
 * Extract class-body members as `{ name, raw source slice including its
 * trailing blank line }`. The slice runs from the member's first line up to
 * (but not including) the next class member of equal indent — or end of
 * file, whichever comes first.
 */
function extractWithRegex(source: string): Array<{ name: string; source: string }> {
  const lines = source.split('\n')
  const indices: Array<{ name: string; line: number }> = []
  let inClass = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^class\s+\w+/.test(line)) {
      inClass = true
      continue
    }
    if (!inClass) continue
    // Leaving the class body — back at column 0 with content.
    if (line.length && !/^\s/.test(line) && !line.startsWith('#')) {
      inClass = false
      continue
    }
    const methodMatch = METHOD_RE.exec(line)
    if (methodMatch) {
      indices.push({ name: methodMatch[3], line: i })
      continue
    }
    const constMatch = CONST_RE.exec(line)
    if (constMatch) {
      indices.push({ name: constMatch[2], line: i })
    }
  }

  const members: Array<{ name: string; source: string }> = []
  for (let idx = 0; idx < indices.length; idx++) {
    const start = indices[idx].line
    const end = idx + 1 < indices.length ? indices[idx + 1].line : findClassEnd(lines, start)
    const slice = lines.slice(start, end).join('\n')
    members.push({ name: indices[idx].name, source: trimTrailingBlankLines(slice) })
  }
  return members
}

function findClassEnd(lines: string[], from: number): number {
  // Walk forward until we hit a non-indented non-blank line.
  for (let i = from + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.length === 0) continue
    if (!/^\s/.test(line)) return i
  }
  return lines.length
}

function trimTrailingBlankLines(text: string): string {
  return text.replace(/\n+$/, '')
}

// ---------------------------------------------------------------------------
// Splicing
// ---------------------------------------------------------------------------

/**
 * Append the supplied member sources at the end of the first `class …:` block
 * in the existing file. We locate the end by walking down to the last line
 * whose indent is still ≥4 spaces (i.e. still inside the class body).
 */
function spliceClassMembers(existing: string, members: string[]): string {
  if (!members.length) return existing
  const lines = existing.split('\n')
  const classLine = lines.findIndex((l) => /^class\s+\w+/.test(l))
  if (classLine === -1) return existing + '\n' + members.join('\n\n') + '\n'

  let lastBodyLine = classLine
  for (let i = classLine + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.length === 0) continue
    if (!/^\s/.test(line)) break
    lastBodyLine = i
  }

  const before = lines.slice(0, lastBodyLine + 1)
  const after = lines.slice(lastBodyLine + 1)
  const insertion = members.map((m) => m + '\n').join('\n')
  return [...before, '', insertion.replace(/\n$/, ''), ...after].join('\n')
}

function mergeImports(existingSource: string, incomingSource: string): string {
  const existingImports = new Set(
    existingSource.split('\n').filter((l) => /^(from\s+\S+\s+import\s+|import\s+\S+)/.test(l)),
  )
  const incomingImports = incomingSource
    .split('\n')
    .filter((l) => /^(from\s+\S+\s+import\s+|import\s+\S+)/.test(l))
  const missing = incomingImports.filter((l) => !existingImports.has(l))
  if (!missing.length) return existingSource

  const lines = existingSource.split('\n')
  let insertAt = 0
  for (let i = 0; i < lines.length; i++) {
    if (/^(from\s+\S+\s+import\s+|import\s+\S+)/.test(lines[i])) insertAt = i + 1
  }
  return [...lines.slice(0, insertAt), ...missing, ...lines.slice(insertAt)].join('\n')
}
