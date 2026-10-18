import path from 'node:path'
import ts from 'typescript'

/**
 * Test-only: full semantic type-check of generated TypeScript files against
 * the real `@playwright/test` typings. Unlike `syntaxErrors`, this catches
 * code that parses but cannot run — `getByRole(button[name="Apply"])` is a
 * valid element-access expression, only the type-checker sees `button` is
 * undefined. Files are served from memory under a folder inside the repo so
 * module resolution finds `node_modules`.
 */
export function typeErrors(files: Record<string, string>): string[] {
  const virtualRoot = path.resolve(process.cwd(), '.recospec-typecheck')
  const virtualFiles = new Map(
    Object.entries(files).map(([name, source]) => [path.join(virtualRoot, name), source]),
  )
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: ['node'],
  }
  const host = ts.createCompilerHost(options)
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)
  host.readFile = (name) => virtualFiles.get(path.normalize(name)) ?? readFile(name)
  host.fileExists = (name) => virtualFiles.has(path.normalize(name)) || fileExists(name)
  host.directoryExists = (dir) =>
    path.normalize(dir).startsWith(virtualRoot) || ts.sys.directoryExists(dir)
  host.getSourceFile = (name, languageVersion, onError, shouldCreate) => {
    const source = virtualFiles.get(path.normalize(name))
    return source !== undefined
      ? ts.createSourceFile(name, source, languageVersion, true)
      : getSourceFile(name, languageVersion, onError, shouldCreate)
  }

  const program = ts.createProgram([...virtualFiles.keys()], options, host)
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => !d.file || virtualFiles.has(path.normalize(d.file.fileName)))
    .map((d) => {
      const message = ts.flattenDiagnosticMessageText(d.messageText, ' ')
      if (d.file && d.start !== undefined) {
        const { line } = d.file.getLineAndCharacterOfPosition(d.start)
        return `${path.basename(d.file.fileName)}:${line + 1} ${message}`
      }
      return message
    })
}
