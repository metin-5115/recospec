import type { GeneratedFile } from '@shared/types/generated'
import type { RenderOptions } from '../registry'
import { BASE_URL_ENV_VAR } from '@shared/constants'
import { configuredBaseUrl } from '../../shared/base-url'
import { pyStr } from './locator'
import { renderFixturesScaffold } from '../../shared/upload-fixtures'

const REQUIREMENTS_TXT = `selenium>=4.15.0
pytest>=7.4.0
pytest-html>=4.1.0
webdriver-manager>=4.0.0
python-dotenv>=1.0.0
Pillow>=10.0.0
`

function renderConftest(options: RenderOptions): string {
  return `import os

import pytest
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

# Load .env (if present) so os.environ.get(...) lookups in tests find the values.
load_dotenv()

# Every test opens routes under this URL; override it to run against another deployment:
#   BASE_URL=https://staging.example.com pytest
BASE_URL = os.environ.get('${BASE_URL_ENV_VAR}', ${pyStr(configuredBaseUrl(options.baseUrl))})


def pytest_addoption(parser):
    parser.addoption(
        '--headed',
        action='store_true',
        default=False,
        help='Run Chrome in headed mode (default: headless)',
    )


@pytest.fixture(scope='function')
def driver(request):
    """Function-scoped Chrome WebDriver."""
    options = Options()
    if not request.config.getoption('--headed'):
        options.add_argument('--headless=new')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1280,720')
    service = Service(ChromeDriverManager().install())
    drv = webdriver.Chrome(service=service, options=options)
    drv.base_url = BASE_URL
    drv.implicitly_wait(0)
    yield drv
    drv.quit()
`
}

const PYTEST_INI = `[pytest]
testpaths = tests
python_files = test_*.py
addopts = -v --html=report.html --self-contained-html
`

export function renderScaffold(options: RenderOptions = {}): GeneratedFile[] {
  const files: GeneratedFile[] = [
    { filename: 'requirements.txt', content: REQUIREMENTS_TXT },
    { filename: 'conftest.py', content: renderConftest(options) },
    { filename: 'pytest.ini', content: PYTEST_INI },
    { filename: 'pages/__init__.py', content: '' },
    { filename: 'tests/__init__.py', content: '' },
    ...renderFixturesScaffold(options),
  ]
  const params = options.testData?.params.filter((p) => p.useEnvVar) ?? []
  if (params.length) {
    const header = '# Recospec — copy to .env and fill in your test data values.\n'
    const body = params.map((p) => `${p.envVarName}=${p.isSecret ? '' : p.defaultValue}`).join('\n')
    files.push({ filename: '.env.example', content: `${header}${body}\n` })
  }
  return files
}
