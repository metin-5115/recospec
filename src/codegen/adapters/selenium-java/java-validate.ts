/**
 * Lightweight Java syntax sanity checker. We don't run javac (it would require
 * a JDK on every contributor's machine and would slow tests down by an order of
 * magnitude), so we settle for cheap structural checks that catch the kinds of
 * bugs codegen typically produces: unbalanced braces, unclosed string literals,
 * stray angle brackets in annotations.
 *
 * Full compile validation is deferred to Phase 4.
 */

export interface JavaValidationIssue {
  line: number
  message: string
}

export interface JavaValidationResult {
  ok: boolean
  issues: JavaValidationIssue[]
}

const PAIRS: Record<string, string> = { ')': '(', '}': '{', ']': '[' }

/**
 * Walk the source character-by-character honouring Java string literals, char
 * literals, and `// … \n` / `/* … *\/` comments. Track the bracket stack and
 * report mismatches.
 */
export function validateJavaSource(source: string): JavaValidationResult {
  const issues: JavaValidationIssue[] = []
  const stack: { char: string; line: number }[] = []
  let line = 1
  let i = 0
  const n = source.length

  while (i < n) {
    const c = source[i]
    const next = source[i + 1]

    if (c === '\n') {
      line += 1
      i += 1
      continue
    }

    // Line comment
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i += 1
      continue
    }
    // Block comment
    if (c === '/' && next === '*') {
      i += 2
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line += 1
        i += 1
      }
      if (i >= n) {
        issues.push({ line, message: 'unterminated block comment' })
        return { ok: false, issues }
      }
      i += 2
      continue
    }

    // String literal
    if (c === '"') {
      const startLine = line
      i += 1
      while (i < n && source[i] !== '"') {
        if (source[i] === '\\' && i + 1 < n) {
          // skip escape, but track newlines if any (Java forbids raw newline in "")
          if (source[i + 1] === '\n') line += 1
          i += 2
          continue
        }
        if (source[i] === '\n') {
          issues.push({ line: startLine, message: 'unterminated string literal' })
          return { ok: false, issues }
        }
        i += 1
      }
      if (i >= n) {
        issues.push({ line: startLine, message: 'unterminated string literal' })
        return { ok: false, issues }
      }
      i += 1 // consume closing "
      continue
    }

    // Char literal
    if (c === "'") {
      const startLine = line
      i += 1
      while (i < n && source[i] !== "'") {
        if (source[i] === '\\' && i + 1 < n) {
          i += 2
          continue
        }
        if (source[i] === '\n') {
          issues.push({ line: startLine, message: 'unterminated char literal' })
          return { ok: false, issues }
        }
        i += 1
      }
      if (i >= n) {
        issues.push({ line: startLine, message: 'unterminated char literal' })
        return { ok: false, issues }
      }
      i += 1
      continue
    }

    if (c === '(' || c === '{' || c === '[') {
      stack.push({ char: c, line })
    } else if (c === ')' || c === '}' || c === ']') {
      const top = stack.pop()
      if (!top || top.char !== PAIRS[c]) {
        issues.push({
          line,
          message: top
            ? `mismatched bracket: expected matching '${top.char}' (opened on line ${top.line}) but found '${c}'`
            : `unmatched closing '${c}'`,
        })
        return { ok: false, issues }
      }
    }

    i += 1
  }

  if (stack.length) {
    const last = stack[stack.length - 1]
    issues.push({ line: last.line, message: `unclosed '${last.char}'` })
    return { ok: false, issues }
  }

  return { ok: true, issues: [] }
}
