import type { GeneratedCode } from '@shared/types/generated'
import type { Session } from '@shared/types/session'
import { resolveOutputPath } from './output-path'
import { flowSlug } from '../shared/flow-slug'
import {
  JAVA_TEST_DATA_PROPERTIES_PATH,
  PLAYWRIGHT_MIN_NODE_VERSION,
  RECOSPEC_REPO_URL,
} from '@shared/constants'

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

function baseUrlRunCommand(framework: string): string {
  if (framework === 'cypress') return 'npx cypress run'
  if (framework === 'selenium-py') return 'pytest'
  if (framework === 'selenium-java') return 'mvn test'
  return 'npx playwright test'
}

const UPLOAD_FIXTURES_NOTE = `## Upload fixtures

The recording picked files through a file input. Recospec keeps only the file names, so the generated steps read them from \`fixtures/\` (next to \`package.json\` / \`pom.xml\` / \`conftest.py\`) — add files with the same names there before running the tests.
`

/** The example file a scaffold ships for the credentials a flow types, and the real file it becomes. */
const TEST_DATA_FILES: Record<string, { example: string; real: string }> = {
  'playwright-ts': { example: '.env.example', real: '.env' },
  cypress: { example: 'cypress.env.json.example', real: 'cypress.env.json' },
  'selenium-py': { example: '.env.example', real: '.env' },
  'selenium-java': {
    example: `${JAVA_TEST_DATA_PROPERTIES_PATH}.example`,
    real: JAVA_TEST_DATA_PROPERTIES_PATH,
  },
}

const TEST_DATA_LOADERS: Record<string, string> = {
  'playwright-ts': `\`playwright.config.ts\` loads \`.env\` with Node's built-in \`process.loadEnvFile\`, so Node ${PLAYWRIGHT_MIN_NODE_VERSION.replace(/\.0$/, '')} or newer is required (see \`engines\` in \`package.json\`).`,
  cypress: 'Cypress reads `cypress.env.json` on its own through `Cypress.env()`.',
  'selenium-py': '`conftest.py` loads `.env` with `python-dotenv`.',
  'selenium-java':
    'The generated `TestData` helper reads it from the class path (`src/test/resources`).',
}

function testDataSection(framework: string, hasTestData: boolean): string {
  const files = TEST_DATA_FILES[framework]
  if (!hasTestData || !files) return ''
  const windows = (path: string): string => path.replace(/\//g, '\\')
  const copy = `cp ${files.example} ${files.real}   # Windows: copy ${windows(files.example)} ${windows(files.real)}`
  return `## Test data

The flow typed credentials, so the tests read them from the environment instead of hard-coding them. Copy the example file, fill in your values, then run the tests as usual:

\`\`\`bash
${copy}
\`\`\`

${TEST_DATA_LOADERS[framework]} Fill in every blank value (secrets are never exported); a variable set in your shell or CI wins over the file. The real file is listed in \`.gitignore\` — only the \`.example\` file belongs in git.

`
}

const README_TEMPLATE = (
  session: Session,
  framework: string,
  hasUploads: boolean,
  hasTestData: boolean,
) => {
  const snapshotsDir = `tests/${flowSlug(session.name)}.spec.ts-snapshots/`
  const isCypress = framework === 'cypress'
  const isSeleniumPy = framework === 'selenium-py'
  const isSeleniumJava = framework === 'selenium-java'
  const runCommand = isCypress
    ? '```bash\nnpm install\nnpx cypress run\n```'
    : isSeleniumPy
      ? '```bash\npython -m venv .venv\n. .venv/bin/activate    # Windows: .venv\\Scripts\\activate\npip install -r requirements.txt\npytest\n```'
      : isSeleniumJava
        ? '```bash\nmvn test\n# headed mode:\nmvn test -Dheaded=true\n```'
        : '```bash\nnpm install\nnpx playwright install chromium\nnpx playwright test\n```'
  const structure = isCypress
    ? '```\ncypress/e2e/         Test scenarios\ncypress/pages/       Page Object Model classes\ncypress/support/     Custom commands (incl. cy.selfHealing, image-snapshot)\ncypress/screenshots/ Visual regression baselines (committed)\ncypress.config.js\npackage.json\n```'
    : isSeleniumPy
      ? '```\npages/         Page Object Model classes (one file per recorded page)\ntests/         Pytest test scenarios\nconftest.py    Chrome WebDriver fixture (headless by default; --headed flag)\npytest.ini     Pytest config + HTML report\nrequirements.txt\n```'
      : isSeleniumJava
        ? '```\nsrc/main/java/pages/   Page Object Model classes (PageFactory + @FindBy)\nsrc/test/java/tests/   TestNG test classes (@BeforeMethod / @Test / @AfterMethod)\npom.xml                Maven build (selenium-java, testng, webdrivermanager)\ntestng.xml             TestNG suite config\n```'
        : `\`\`\`\npages/                              Page Object Model classes (one file per page)\ntests/                              Test scenarios\n${snapshotsDir}   Visual regression baselines (committed)\nutils/                              selfHealingLocator helper\nplaywright.config.ts\npackage.json\n\`\`\``

  const selfHealingNote = isCypress
    ? 'Elements whose primary and fallback locators are CSS selectors read `cy.selfHealing([...])` (registered in `cypress/support/locator.js`): the first selector that matches wins, and a warning names the fallback when the primary is gone. Fallbacks that need a testing-library query stay as `// Fallbacks:` comments.'
    : isSeleniumPy
      ? 'Each page-object element class constant ships with a `# Fallbacks: ...` comment listing the locator tuples Recospec ranked just below the primary. Swap them in manually if the primary selector breaks.'
      : isSeleniumJava
        ? 'Each `@FindBy`-annotated WebElement field ships with a `// Fallbacks: ...` comment listing the alternate `@FindBy(...)` annotations Recospec ranked just below the primary. Swap one in manually when the primary selector breaks — PageFactory will pick it up on the next page navigation.'
        : 'Page-object getters for elements with fallbacks return `selfHealingLocator(this.page, [primary, ...fallbacks])` (`utils/locator.ts`): it matches the primary locator or, when that no longer exists, a fallback, and logs a warning naming the fallback in use. Pick Runtime self-healing off when generating to keep plain locators.'

  const selfHealingTitle =
    isSeleniumPy || isSeleniumJava ? 'Fallback locator suggestions' : 'Self-healing locators'

  const selfHealingIntro =
    isSeleniumPy || isSeleniumJava
      ? 'Selenium has no runtime self-healing helper here, so these are fallback suggestions:'
      : 'Fallbacks are used at run time when the primary locator breaks:'

  const visualRegressionNote = isCypress
    ? `Generated tests use [\`cypress-image-snapshot\`](https://github.com/jaredpalmer/cypress-image-snapshot) for visual regression. The first run produces baselines under \`cypress/screenshots/\` — commit them. Later runs compare pixel-by-pixel; the default \`failureThreshold\` is \`0.02\` (2%). Update baselines with:

\`\`\`bash
npx cypress run --env updateSnapshots=true
\`\`\``
    : isSeleniumPy
      ? `Selenium has no built-in visual matcher, so screenshot assertions call a small \`_assert_screenshot()\` helper (Pillow, listed in \`requirements.txt\`). The first run records a baseline under \`screenshots/\` — commit it. Later runs fail when more than the allowed ratio of pixels differ (default \`0.02\`). Delete a baseline to re-record it.`
      : isSeleniumJava
        ? `Selenium has no built-in visual matcher, so screenshot assertions call a small \`assertScreenshot()\` helper (JDK \`ImageIO\` only — no extra dependency). The first run records a baseline under \`screenshots/\` — commit it. Later runs fail when more than the allowed ratio of pixels differ (default \`0.02\`). Delete a baseline to re-record it.`
        : `Generated tests use Playwright's built-in \`toHaveScreenshot()\` matcher. The first run produces baselines under \`${snapshotsDir}\` — commit them. Later runs compare pixel-by-pixel; the default \`threshold\` is \`0.2\` (20% per-pixel allowance). Update baselines with:

\`\`\`bash
npx playwright test --update-snapshots
\`\`\``

  return `\
# Recospec — Generated Test

Session: **${session.name}**
Framework: **${framework}**
Generated: ${new Date().toISOString()}
Start URL: ${session.startUrl}

## How to run

${runCommand}

## Target environment

Every test opens pages relative to one base URL — by default the origin the flow was recorded on (${originOf(session.startUrl)}). Point the suite at another deployment with the \`BASE_URL\` environment variable:

\`\`\`bash
BASE_URL=https://staging.example.com ${baseUrlRunCommand(framework)}
\`\`\`

${testDataSection(framework, hasTestData)}## Project structure

${structure}

## ${selfHealingTitle}

Each page-object element ships with a \`// Fallbacks: ...\` comment listing
the locator strategies Recospec ranked just below the primary.
${selfHealingIntro}

${selfHealingNote}

${
  hasUploads
    ? `${UPLOAD_FIXTURES_NOTE}
`
    : ''
}## Visual regression

${visualRegressionNote}

Generated by [Recospec](${RECOSPEC_REPO_URL}).
`
}

export async function buildZipExport(session: Session, code: GeneratedCode): Promise<Blob> {
  // JSZip is ~95 KB; load it only when an export is actually requested.
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  for (const file of code.files) {
    zip.file(resolveOutputPath(file.filename, code.framework), file.content)
  }

  const hasUploads = code.files.some((f) => f.filename.startsWith('fixtures/'))
  const example = TEST_DATA_FILES[code.framework]?.example
  const hasTestData = example !== undefined && code.files.some((f) => f.filename === example)
  zip.file('README.md', README_TEMPLATE(session, code.framework, hasUploads, hasTestData))

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
