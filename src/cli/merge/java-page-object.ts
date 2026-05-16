import prompts from 'prompts'

export interface JavaMergeResult {
  source: string
  added: string[]
  skipped: string[]
  /**
   * `'nested-class'` when the existing file has a nested/inner class and the
   * caller's prompt fallback resolved to "skip" — the merger leaves the file
   * untouched. `'overwrite'` when the prompt resolved to overwrite (caller
   * is expected to write `incoming` verbatim). `null` for a clean merge.
   */
  fallback: 'nested-class-overwrite' | 'nested-class-skip' | null
}

interface ClassBlock {
  /** Index of the `{` character that opens the class body. */
  bodyStart: number
  /** Index of the `}` that closes the class body. */
  bodyEnd: number
  /** True when the body contains a nested class declaration. */
  hasNestedClass: boolean
}

/**
 * Merge two Java page-object files.
 *
 * We cannot use a real Java parser (javaparser is JVM-only; the npm port is
 * abandoned), so we settle for a balanced-brace walker. It is reliable for
 * the page objects PlayForge emits — single top-level class, no inner
 * classes — and we explicitly bail out when an `existing` file already has
 * nested classes, since brace counting would conflate inner+outer members.
 *
 * For each top-level field (`public WebElement foo`, `@FindBy(...) private
 * WebElement bar`) and method (`public void login(...)`) in `incoming` that
 * is not already declared in `existing`, we splice the source slice in just
 * before the closing `}` of the existing class.
 */
export async function mergeJavaPageObject(
  existing: string,
  incoming: string,
): Promise<JavaMergeResult> {
  const existingClass = findOuterClass(existing)
  const incomingClass = findOuterClass(incoming)
  if (!existingClass || !incomingClass) {
    throw new Error(
      'mergeJavaPageObject: could not locate a top-level class — falling back to overwrite is recommended.',
    )
  }

  if (existingClass.hasNestedClass) {
    const decision = await promptForNestedClass()
    if (decision === 'overwrite') {
      return { source: incoming, added: [], skipped: [], fallback: 'nested-class-overwrite' }
    }
    return { source: existing, added: [], skipped: [], fallback: 'nested-class-skip' }
  }

  const existingBody = existing.slice(existingClass.bodyStart + 1, existingClass.bodyEnd)
  const incomingBody = incoming.slice(incomingClass.bodyStart + 1, incomingClass.bodyEnd)

  const existingNames = collectMemberNames(existingBody)
  const incomingMembers = collectMembers(incomingBody)

  const added: string[] = []
  const skipped: string[] = []
  const toAppend: string[] = []
  for (const member of incomingMembers) {
    if (existingNames.has(member.name)) {
      skipped.push(member.name)
      continue
    }
    toAppend.push(member.source)
    added.push(member.name)
    existingNames.add(member.name)
  }

  const merged =
    existing.slice(0, existingClass.bodyEnd) +
    (toAppend.length ? '\n' + toAppend.join('\n\n') + '\n' : '') +
    existing.slice(existingClass.bodyEnd)
  const withImports = mergeImports(merged, incoming)

  return {
    source: withImports.endsWith('\n') ? withImports : withImports + '\n',
    added,
    skipped,
    fallback: null,
  }
}

async function promptForNestedClass(): Promise<'overwrite' | 'skip'> {
  const response = (await prompts({
    type: 'select',
    name: 'choice',
    message:
      'The existing Java file has a nested class — safe structural merge is not possible. What now?',
    choices: [
      { title: '[s] skip — keep the existing file untouched', value: 'skip' },
      { title: '[o] overwrite — replace with the generated file', value: 'overwrite' },
    ],
    initial: 0,
  })) as { choice?: 'overwrite' | 'skip' }
  return response.choice ?? 'skip'
}

// ---------------------------------------------------------------------------
// Class-body location
// ---------------------------------------------------------------------------

/**
 * Find the outer `public class X { … }` block. We scan tokens linearly,
 * honouring strings, char literals, and comments, so braces inside those
 * don't confuse the depth counter. The first `class` token at brace depth 0
 * is the outer class; the matching `}` closes it.
 */
function findOuterClass(source: string): ClassBlock | null {
  const tokens = tokenize(source)
  let outerStart: number | null = null
  let depth = 0
  let nestedClassCount = 0
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type === 'word' && t.value === 'class' && outerStart === null) {
      // Find the next `{` at the same depth — that's bodyStart.
      const bodyStart = findOpeningBrace(source, t.endIndex)
      if (bodyStart === -1) return null
      outerStart = bodyStart
      depth = 1
      i = indexOfTokenAt(tokens, bodyStart) + 1
      continue
    }
    if (outerStart !== null) {
      if (t.type === 'word' && t.value === 'class') nestedClassCount += 1
      if (t.type === 'punct') {
        if (t.value === '{') depth += 1
        else if (t.value === '}') {
          depth -= 1
          if (depth === 0) {
            return {
              bodyStart: outerStart,
              bodyEnd: t.startIndex,
              hasNestedClass: nestedClassCount > 0,
            }
          }
        }
      }
    }
  }
  return null
}

interface Token {
  type: 'word' | 'punct' | 'other'
  value: string
  startIndex: number
  endIndex: number
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source[i]
    const next = source[i + 1]
    // Line comment
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i += 1
      continue
    }
    // Block comment
    if (c === '/' && next === '*') {
      i += 2
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    // String literal
    if (c === '"') {
      i += 1
      while (i < n && source[i] !== '"') {
        if (source[i] === '\\' && i + 1 < n) {
          i += 2
          continue
        }
        i += 1
      }
      i += 1
      continue
    }
    // Char literal
    if (c === "'") {
      i += 1
      while (i < n && source[i] !== "'") {
        if (source[i] === '\\' && i + 1 < n) {
          i += 2
          continue
        }
        i += 1
      }
      i += 1
      continue
    }
    // Word
    if (/[A-Za-z_]/.test(c)) {
      const start = i
      while (i < n && /[A-Za-z0-9_]/.test(source[i])) i += 1
      tokens.push({ type: 'word', value: source.slice(start, i), startIndex: start, endIndex: i })
      continue
    }
    // Punct (we only care about braces; everything else is `other`)
    if (c === '{' || c === '}') {
      tokens.push({ type: 'punct', value: c, startIndex: i, endIndex: i + 1 })
      i += 1
      continue
    }
    i += 1
  }
  return tokens
}

function findOpeningBrace(source: string, fromIndex: number): number {
  for (let i = fromIndex; i < source.length; i++) {
    if (source[i] === '{') return i
  }
  return -1
}

function indexOfTokenAt(tokens: Token[], charIndex: number): number {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].startIndex === charIndex) return i
  }
  return -1
}

// ---------------------------------------------------------------------------
// Member extraction
// ---------------------------------------------------------------------------

interface Member {
  name: string
  source: string
}

const METHOD_RE =
  /(?:^|\n)([ \t]*(?:@\w+(?:\([^)]*\))?[ \t\r\n]+)*(?:public|protected|private|static|final|synchronized|abstract|\s)+[\w<>,?[\] ]+?\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:throws[^{]+)?\{)/g

const FIELD_RE =
  /(?:^|\n)([ \t]*(?:@\w+(?:\([^)]*\))?[ \t\r\n]+)*(?:public|protected|private|static|final|\s)+[\w<>,?[\] ]+?\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=[^;]+)?\s*;)/g

function collectMembers(body: string): Member[] {
  const out: Member[] = []
  // Methods
  for (const match of body.matchAll(METHOD_RE)) {
    const headStart = (match.index ?? 0) + match[0].indexOf(match[1])
    const braceIdx = headStart + match[1].length - 1
    const bodyEnd = findMatchingBrace(body, braceIdx)
    if (bodyEnd === -1) continue
    out.push({
      name: match[2],
      source: body.slice(headStart, bodyEnd + 1),
    })
  }
  // Fields
  for (const match of body.matchAll(FIELD_RE)) {
    const headStart = (match.index ?? 0) + match[0].indexOf(match[1])
    const decl = match[1]
    // Skip if this declaration overlaps an already-captured method head.
    if (
      out.some(
        (m) =>
          headStart >= body.indexOf(m.source) &&
          headStart < body.indexOf(m.source) + m.source.length,
      )
    ) {
      continue
    }
    out.push({ name: match[2], source: decl.replace(/^\s*\n/, '') })
  }
  return out
}

function collectMemberNames(body: string): Set<string> {
  return new Set(collectMembers(body).map((m) => m.name))
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0
  for (let i = openIndex; i < source.length; i++) {
    const c = source[i]
    if (c === '"' || c === "'") {
      i = skipLiteral(source, i)
      continue
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && source[i + 1] === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 1
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function skipLiteral(source: string, openIndex: number): number {
  const quote = source[openIndex]
  let i = openIndex + 1
  while (i < source.length && source[i] !== quote) {
    if (source[i] === '\\' && i + 1 < source.length) {
      i += 2
      continue
    }
    i += 1
  }
  return i
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

function mergeImports(existingSource: string, incomingSource: string): string {
  const existingImports = new Set(
    existingSource
      .split('\n')
      .filter((l) => /^\s*import\s+\S+;/.test(l))
      .map((l) => l.trim()),
  )
  const incomingImports = incomingSource
    .split('\n')
    .filter((l) => /^\s*import\s+\S+;/.test(l))
    .map((l) => l.trim())
  const missing = incomingImports.filter((l) => !existingImports.has(l))
  if (!missing.length) return existingSource

  const lines = existingSource.split('\n')
  let insertAt = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s+\S+;/.test(lines[i])) insertAt = i
  }
  if (insertAt === -1) {
    // No existing imports — insert after the `package` declaration if any.
    insertAt = lines.findIndex((l) => /^\s*package\s+\S+;/.test(l))
  }
  return [...lines.slice(0, insertAt + 1), ...missing, ...lines.slice(insertAt + 1)].join('\n')
}
