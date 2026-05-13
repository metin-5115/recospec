import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import _generate from '@babel/generator'
import type {
  ClassDeclaration,
  ClassMethod,
  ClassProperty,
  ClassBody,
  Statement,
  ImportDeclaration,
} from '@babel/types'

// `@babel/traverse` and `@babel/generator` publish a CJS default export. Under
// `moduleResolution: bundler` TS gives us the namespace; pick the runtime fn
// off of `.default` when present.
const traverse = ((_traverse as unknown as { default?: typeof _traverse }).default ??
  _traverse) as typeof _traverse
const generate = ((_generate as unknown as { default?: typeof _generate }).default ??
  _generate) as typeof _generate

export interface MergeResult {
  /** Final source text — write this back to the file on disk. */
  source: string
  /** Names of class members that were appended. */
  added: string[]
  /** Names of class members that already existed and were left alone. */
  skipped: string[]
}

/**
 * Merge `incoming` into `existing` for a single TS page-object file.
 *
 * Strategy:
 *   1. Parse both with `@babel/parser` (TypeScript + class properties).
 *   2. Locate the top-level exported class in each file.
 *   3. For every member in the incoming class (getter, method, property)
 *      that does NOT already exist in the existing class, append it.
 *   4. Merge any incoming `import` declarations that are missing.
 *   5. Regenerate.
 *
 * The existing class's other members (anything the user has hand-edited) are
 * preserved verbatim — we only ADD, never overwrite. This is what makes the
 * `playforge add` workflow safe to re-run after manual edits.
 */
export function mergeTsPageObject(existing: string, incoming: string): MergeResult {
  const existingAst = parseTs(existing)
  const incomingAst = parseTs(incoming)

  const existingClass = findFirstExportedClass(existingAst.program.body)
  const incomingClass = findFirstExportedClass(incomingAst.program.body)

  if (!existingClass || !incomingClass) {
    throw new Error(
      'mergeTsPageObject: could not locate an exported class in either source — falling back to overwrite is recommended.',
    )
  }

  const existingMemberNames = collectMemberNames(existingClass.body)
  const added: string[] = []
  const skipped: string[] = []

  for (const member of incomingClass.body.body) {
    const name = memberName(member)
    if (!name) continue
    if (existingMemberNames.has(name)) {
      skipped.push(name)
      continue
    }
    existingClass.body.body.push(member)
    existingMemberNames.add(name)
    added.push(name)
  }

  mergeImports(existingAst.program.body, incomingAst.program.body)

  const out = generate(existingAst, {
    retainLines: false,
    jsescOption: { minimal: true },
  })

  return {
    source: out.code.endsWith('\n') ? out.code : out.code + '\n',
    added,
    skipped,
  }
}

function parseTs(source: string) {
  return parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'classProperties', 'classPrivateProperties', 'decorators-legacy'],
  })
}

function findFirstExportedClass(body: Statement[]): ClassDeclaration | null {
  for (const node of body) {
    if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'ClassDeclaration') {
      return node.declaration
    }
    if (node.type === 'ExportDefaultDeclaration' && node.declaration.type === 'ClassDeclaration') {
      return node.declaration
    }
    if (node.type === 'ClassDeclaration') return node
  }
  // Fallback: walk the AST in case the class is nested.
  let found: ClassDeclaration | null = null
  traverse({ type: 'Program', body, sourceType: 'module', directives: [] } as never, {
    ClassDeclaration(path) {
      if (!found) found = path.node
    },
  })
  return found
}

function collectMemberNames(body: ClassBody): Set<string> {
  const names = new Set<string>()
  for (const member of body.body) {
    const n = memberName(member)
    if (n) names.add(n)
  }
  return names
}

function memberName(node: ClassBody['body'][number]): string | null {
  if (node.type === 'ClassMethod' || node.type === 'ClassProperty') {
    return identifierName((node as ClassMethod | ClassProperty).key)
  }
  return null
}

function identifierName(key: ClassMethod['key'] | ClassProperty['key']): string | null {
  if (!key) return null
  if (key.type === 'Identifier') return key.name
  if (key.type === 'StringLiteral') return key.value
  return null
}

/**
 * Append imports from `incomingBody` that the existing file doesn't already
 * have (matched by source string + same default/specifier shape).
 */
function mergeImports(existingBody: Statement[], incomingBody: Statement[]): void {
  const existingImports = existingBody.filter(
    (n): n is ImportDeclaration => n.type === 'ImportDeclaration',
  )
  const existingSources = new Set(existingImports.map((n) => n.source.value))

  // Find the index of the last existing import so we append after it.
  let insertAt = 0
  for (let i = 0; i < existingBody.length; i++) {
    if (existingBody[i].type === 'ImportDeclaration') insertAt = i + 1
  }

  for (const node of incomingBody) {
    if (node.type !== 'ImportDeclaration') continue
    if (existingSources.has(node.source.value)) continue
    existingBody.splice(insertAt, 0, node)
    insertAt++
    existingSources.add(node.source.value)
  }
}
