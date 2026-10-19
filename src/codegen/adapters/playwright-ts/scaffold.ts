import type { GeneratedFile } from '../../ir/types'
import { PLAYWRIGHT_SELF_HEALING_TS } from '../../scaffold/self-healing'
import type { RenderOptions } from '../registry'

function renderEnvExample(options: RenderOptions): GeneratedFile | null {
  const params = options.testData?.params.filter((p) => p.useEnvVar) ?? []
  if (!params.length) return null
  const header = '# Recospec — copy to .env and fill in your test data values.\n'
  const body = params.map((p) => `${p.envVarName}=${p.isSecret ? '' : p.defaultValue}`).join('\n')
  return { filename: '.env.example', content: `${header}${body}\n` }
}

export function renderScaffold(options: RenderOptions = {}): GeneratedFile[] {
  const packageJson = JSON.stringify(
    {
      name: 'recospec-generated-tests',
      version: '1.0.0',
      private: true,
      scripts: {
        test: 'playwright test',
        'test:headed': 'playwright test --headed',
      },
      devDependencies: {
        '@playwright/test': '^1.40.0',
        // date-fns powers parameterized date-template page-object accessors.
        'date-fns': '^3.6.0',
        typescript: '^5.3.0',
      },
    },
    null,
    2,
  )

  const playwrightConfig = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
`

  const tsConfig = JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'commonjs',
        lib: ['ES2022'],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: 'dist',
      },
      include: ['**/*.ts'],
      exclude: ['node_modules', 'dist'],
    },
    null,
    2,
  )

  const files: GeneratedFile[] = [
    { filename: 'package.json', content: packageJson },
    { filename: 'playwright.config.ts', content: playwrightConfig },
    { filename: 'tsconfig.json', content: tsConfig },
    { filename: 'utils/locator.ts', content: PLAYWRIGHT_SELF_HEALING_TS },
    { filename: 'tests/scenario.spec.ts-snapshots/.gitkeep', content: '' },
  ]
  const envExample = renderEnvExample(options)
  if (envExample) files.push(envExample)
  return files
}
