/** Python names: snake_case modules, methods and parameters (PEP 8). */

const PY_KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
])

/** Snake-case for module file names: LoginPage → login_page. */
export function toSnakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, '')
}

/** Snake-case identifier for a method or parameter; a Python keyword gets a trailing underscore. */
export function toPyIdentifier(name: string): string {
  const snake = toSnakeCase(name) || 'value'
  const safe = /^\d/.test(snake) ? `_${snake}` : snake
  return PY_KEYWORDS.has(safe) ? `${safe}_` : safe
}
