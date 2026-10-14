import ts from 'typescript'

/**
 * Test-only: syntactic diagnostics for generated TS/JS. `typescript` is a
 * devDependency and must never be imported from code that ships in the bundle.
 */
export function syntaxErrors(source: string, fileName: string): string[] {
  const result = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      allowJs: true,
    },
  })
  return (result.diagnostics ?? []).map((d) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, ' ')
    if (d.file && d.start !== undefined) {
      const { line } = d.file.getLineAndCharacterOfPosition(d.start)
      return `${fileName}:${line + 1} ${message}`
    }
    return `${fileName} ${message}`
  })
}
