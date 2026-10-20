import { PLAYWRIGHT_MIN_NODE_VERSION } from '@shared/constants'

/**
 * Playwright does not read `.env` by itself. The generated config loads it with Node's built-in
 * `process.loadEnvFile` (no `dotenv` dependency). A missing file is fine — a variable already set
 * in the environment (CI, the shell) wins over the file either way.
 */
export const PLAYWRIGHT_ENV_LOADER = `// Load test data from .env (needs Node ${PLAYWRIGHT_MIN_NODE_VERSION}+). A missing file is fine.
try {
  process.loadEnvFile();
} catch {
  // no .env — values come from the environment or fall back to the defaults in the tests
}
`

export const PLAYWRIGHT_ENGINES = { node: `>=${PLAYWRIGHT_MIN_NODE_VERSION}` } as const

export const PLAYWRIGHT_GITIGNORE = `node_modules/
test-results/
playwright-report/
blob-report/
.env
`
