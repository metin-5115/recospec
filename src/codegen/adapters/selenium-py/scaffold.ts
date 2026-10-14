import type { GeneratedFile } from '@shared/types/generated'
import type { TestDataConfig } from '../../ir/types'

let TEST_DATA: TestDataConfig | undefined
export function setSeleniumPyScaffoldTestData(value: TestDataConfig | undefined): void {
  TEST_DATA = value
}

const REQUIREMENTS_TXT = `selenium>=4.15.0
pytest>=7.4.0
pytest-html>=4.1.0
webdriver-manager>=4.0.0
python-dotenv>=1.0.0
Pillow>=10.0.0
`

const CONFTEST_PY = `import pytest
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

# Load .env (if present) so os.environ.get(...) lookups in tests find the values.
load_dotenv()


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
    drv.implicitly_wait(0)
    yield drv
    drv.quit()
`

const PYTEST_INI = `[pytest]
testpaths = tests
python_files = test_*.py
addopts = -v --html=report.html --self-contained-html
`

export function renderScaffold(): GeneratedFile[] {
  const files: GeneratedFile[] = [
    { filename: 'requirements.txt', content: REQUIREMENTS_TXT },
    { filename: 'conftest.py', content: CONFTEST_PY },
    { filename: 'pytest.ini', content: PYTEST_INI },
    { filename: 'pages/__init__.py', content: '' },
    { filename: 'tests/__init__.py', content: '' },
  ]
  const params = TEST_DATA?.params.filter((p) => p.useEnvVar) ?? []
  if (params.length) {
    const header = '# Recospec — copy to .env and fill in your test data values.\n'
    const body = params.map((p) => `${p.envVarName}=${p.isSecret ? '' : p.defaultValue}`).join('\n')
    files.push({ filename: '.env.example', content: `${header}${body}\n` })
  }
  return files
}
