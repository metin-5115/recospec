# Selenium Python eklendi (PlayForge — Hafta 11–12)

PlayForge artık Playwright TS, Cypress ve **Selenium Python (Pytest)** çıktısı üretiyor. Aynı IR (Intermediate Representation), üç farklı framework için production-ready test projesi haline geliyor — codegen pipeline tek; sadece adapter değişiyor.

## Neler dahil?

- **Page Object Model** — `class LoginPage:` + `By.CSS_SELECTOR` / `By.XPATH` tuple sabitleri (`EMAIL_INPUT = (By.CSS_SELECTOR, '[data-testid="login-email"]')`), `__init__` içinde `WebDriverWait`, idiomatic `EC.visibility_of_element_located(...)` çağrıları
- **Inferred methods** — örn. kayıttan otomatik çıkarılan `def login(self, email: str, password: str):` Python tipi anotasyonlarıyla
- **Scaffold** — `requirements.txt` (selenium, pytest, pytest-html, webdriver-manager), `conftest.py` (Chrome WebDriver fixture, `--headed` opsiyonu), `pytest.ini`
- **Self-healing fallback yorumları** — her constant'ın altında `# Fallbacks: (By.CSS_SELECTOR, ...), (By.XPATH, ...)` listesi
- **AST validation** — codegen test suite üretilen Python kodunu `python -c "import ast; ast.parse(...)"` ile parse edip doğruluyor (Python yoksa atlanıyor, CI engellenmiyor)

## Mühendislik notu

İlginç olan: locator stratejilerinin nötr IR'da kalması. `role-name` IR'da `'button', { name: 'Sign In' }` formatında saklanıyor; her adapter kendi idiomatic karşılığına çeviriyor:

```ts
// Playwright
page.getByRole('button', { name: 'Sign In' })

// Cypress
cy.findByRole('button', { name: 'Sign In' })(
  // Selenium Python
  By.XPATH,
  "//button[normalize-space()='Sign In']",
)
```

XPath literal'lerinde tek-tırnak vs çift-tırnak kararını da adapter veriyor — hem `'` hem `"` içeren değerler için XPath'in `concat()` fonksiyonunu kullanıyoruz.

## Sayılar

- 286 test geçiyor (önceki 248'e +38 selenium-py testi)
- Bundle ~478 KB değişmedi (Python adapter pure JS string templating)
- Python AST validation 6 test, ~1.8 saniye — interpreter probe edilemezse skip

GitHub: github.com/your-username/playforge · MIT lisans, telemetri yok.

#OpenSource #Selenium #Python #TestAutomation #Pytest #WebDriver #PageObjectModel #ChromeExtension
