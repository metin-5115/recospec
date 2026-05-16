# PlayForge — Claude Code Proje Rehberi

> Bu dosya Claude Code tarafından her oturumda otomatik okunur. Detaylı tasarım için `docs/technical-design.docx` referans alınmalıdır.

## 1. Proje Vizyonu

PlayForge, kullanıcının web sayfasındaki etkileşimlerini kaydederek **production-ready** test otomasyon kodu üreten açık kaynak bir Chrome eklentisidir. Mevcut codeless araçlardan (Playwright Codegen, Selenium IDE, Cypress Studio) farkı: akıllı locator stratejisi, otomatik Page Object Model üretimi ve çoklu framework desteği (Playwright, Cypress, Selenium Python ve Java).

**Hedef:** Üretilen kodun manuel düzenleme gerektirmeden çalışması.

---

## 2. Tech Stack

- **Extension Framework:** Chrome Manifest V3 (V2 desteği yok)
- **UI:** React 18 + TypeScript (strict mode)
- **Build:** Vite + CRXJS plugin
- **Stil:** Tailwind CSS
- **State:** Zustand
- **Persistence:** IndexedDB (Dexie.js wrapper)
- **Template Engine:** Tagged template literals (Handlebars/EJS DEĞİL)
- **Test (Unit):** Vitest + jsdom
- **Test (E2E):** Playwright
- **Lint/Format:** ESLint + Prettier + Husky pre-commit
- **Package Manager:** pnpm (önerilen) veya npm
- **Node:** 20+ (`.nvmrc` dosyasını kontrol et)

> Detay: `docs/technical-design.docx` Bölüm 7

---

## 3. Mimari Özet

PlayForge dört katmandan oluşur:

1. **UI Layer** — Popup (basit kontrol) + Side Panel (ana çalışma alanı)
2. **Background Service Worker** — Mesaj yönlendirme, session yönetimi, codegen orchestration
3. **Content Script** — Sayfaya inject olur, event yakalama ve locator hesaplama
4. **Code Generation Layer** — Background içinde çalışan, IR → Adapter → Output pipeline'ı

Tüm bileşenler arası iletişim **typed message contract** üzerinden yapılır (discriminated union pattern). Service worker uyuyup uyandığı için **kritik state IndexedDB'de tutulur** — in-memory'de değil.

> Detay: `docs/technical-design.docx` Bölüm 4

---

## 4. Klasör Yapısı

```
playforge/
├── .github/workflows/           # CI/CD
├── docs/                        # Documentation site (Faz 3)
├── public/                      # Manifest, ikonlar
├── src/
│   ├── popup/                   # Popup UI (React)
│   ├── side-panel/              # Side panel UI (React, ana çalışma alanı)
│   ├── background/              # Service worker
│   ├── content/                 # Content script (page'e inject)
│   ├── locator-engine/          # Pure logic: element → locator
│   │   ├── strategies/          # 9 strateji ayrı dosyada
│   │   └── scoring/             # Stability scoring
│   ├── codegen/                 # Pure logic: IR → kod
│   │   ├── normalizer/
│   │   ├── planner/
│   │   ├── adapters/            # Framework adapter'ları
│   │   └── ir/                  # Intermediate Representation tipleri
│   ├── storage/                 # IndexedDB wrapper (Dexie)
│   └── shared/                  # Tipler, mesajlaşma, logger
├── tests/                       # E2E testler
├── benchmarks/                  # Locator benchmark fixture'ları
└── scripts/                     # Build/release helper'ları
```

**Klasör seçimi kararı:**

- Pure logic (no DOM, no browser API) → `locator-engine/`, `codegen/`
- Browser API kullanıyor → `background/`, `content/`, `storage/`
- React component → `popup/` veya `side-panel/`
- Tipler veya cross-cutting → `shared/`

> Detay: `docs/technical-design.docx` Bölüm 12

---

## 5. Naming Convention'ları

### Dosya İsimleri

- React component: `PascalCase.tsx` (örn. `StepList.tsx`)
- Hook: `useXxx.ts` (örn. `useSession.ts`)
- Zustand store: `xxxStore.ts` (örn. `sessionStore.ts`)
- Pure module: `kebab-case.ts` (örn. `event-aggregator.ts`)
- Test: yanına `.test.ts` (unit) veya `.spec.ts` (e2e)

### Sembol İsimleri

- Type/Interface/Class: `PascalCase`
- Fonksiyon: `camelCase`
- Const (enum-like): `SCREAMING_SNAKE_CASE`
- Boolean: `is/has/should` prefix'i (örn. `isDynamic`, `hasShadowRoot`)

### Path Alias'lar (tsconfig.json)

```
@/*          → src/*
@locator/*   → src/locator-engine/*
@codegen/*   → src/codegen/*
@shared/*    → src/shared/*
@storage/*   → src/storage/*
```

Relative import yerine alias kullan (`@locator/strategies/testid` gibi).

---

## 6. KAÇINILMASI Gerekenler

Bu liste **sıkı**. Hiçbir madde göz ardı edilmemeli:

- ❌ `any` tipi — `unknown` kullan, sonra type guard ile daralt
- ❌ `console.log` — `shared/logger.ts` kullan
- ❌ Hardcoded magic number/string — `shared/constants.ts`'e ekle
- ❌ `eval()`, `Function()` constructor — Manifest V3 yasaklıyor (CSP)
- ❌ Inline style/script — CSP zorunlu
- ❌ Manifest V2 patternleri (`background.scripts`, `chrome.tabs.executeScript` eski usul)
- ❌ Dynamic class isimlerine güvenmek (`css-1a2b3c`, `MuiButton-root-273`) — locator'da reddet
- ❌ `localStorage`, `sessionStorage` — IndexedDB (Dexie) kullan
- ❌ `setTimeout` ile state senkronizasyonu — promise-based yap
- ❌ Floating promises — her async çağrı `await` veya `.catch()` ile
- ❌ React Context for global state — Zustand kullan (rerender optimization daha iyi)
- ❌ Handlebars / EJS template engine — Tagged template literals (TS native)
- ❌ Test fixture'larında gerçek site URL'leri — `benchmarks/fixtures/`'tan offline HTML kullan
- ❌ Service worker'da in-memory state'e güvenmek — her şey IndexedDB'ye yazılmalı

---

## 7. Commit Convention

Conventional Commits formatı kullanılır. Husky pre-commit hook bunu zorunlu kılar.

**Format:** `type(scope): subject`

**Type'lar:**

- `feat` — yeni özellik
- `fix` — bug fix
- `docs` — sadece dokümantasyon
- `refactor` — kod yapısı değişikliği, davranış aynı
- `test` — test ekleme/düzeltme
- `chore` — build, dependency, config
- `perf` — performans iyileştirmesi

**Scope'lar:** `locator`, `codegen`, `ui`, `storage`, `bg` (background), `content`, `build`, `deps`

**Örnekler:**

```
feat(locator): add aria-describedby strategy
fix(codegen): handle empty page title gracefully
test(locator): add fixture for Material-UI v5
chore(deps): bump dexie to 4.0.0
```

---

## 8. Test Yazma Kuralları

### Genel Prensipler

- **Coverage hedefi:** Genel %75+, locator-engine ve codegen %85+
- **TDD önerilir:** Önce test yaz, fail ettiğini doğrula, sonra implementasyon
- **Hız hedefi:** Unit suite <10sn, integration <30sn

### Locator Engine Testleri

- Her strateji ayrı test dosyasında (`testid.test.ts`, `aria-label.test.ts`...)
- jsdom kullan, gerçek Chrome çalıştırma
- Her strateji için minimum: 1 positive, 1 negative, 2 edge case
- Fixture testleri için `benchmarks/fixtures/` altında HTML + `expected.json`

### Codegen Testleri

- **Snapshot testing** kullan (Vitest `toMatchSnapshot`)
- Her adapter için fixture IR girdisi → beklenen kod çıktısı
- Üretilen kod **gerçekten compile/parse edilebilmeli** (smoke validation)

### E2E Testleri

- Playwright `chromium.launchPersistentContext` ile extension yükle
- Senaryolar `tests/e2e/` altında, `.spec.ts` uzantısı
- Slow markası: `describe('@slow ...')` — CI'da nightly çalışır

> Detay: `docs/technical-design.docx` Bölüm 13

---

## 9. Mimari Karar Hatırlatıcıları

Bu kararlar verilmiştir, **yeniden tartışma**:

- **Manifest V3 only** — V2'ye fallback yok
- **Chrome only başlangıçta** — Firefox/Edge v2.0 sonrası
- **IndexedDB + Dexie** — chrome.storage.local kullanma (5MB limit, slow)
- **Zustand** — Redux yok, Context yok
- **Tagged templates** — Handlebars, EJS, Mustache yok
- **9 locator stratejisi sırası:** testid > test-attrs > aria-label > role+name > label > text > id > css > xpath
- **Stability scoring formülü:** `uniqueness*0.4 + semanticStrength*0.3 + stability*0.2 + depth*0.1`
- **3 aşamalı codegen pipeline:** Normalizer → Planner → Adapter
- **4 adapter v1.0:** Playwright TS, Cypress JS, Selenium Python (Pytest), Selenium Java (TestNG)
- **MIT lisans + privacy-first** — telemetry/analytics yok
- **Page Object Model çıktısı** — düz file çıktı yok, her sayfa için class

> Karar gerekçeleri: `docs/technical-design.docx` Bölüm 4.6, 5.3, 6.5

---

## 10. Bölüm Eşlemesi (Detay İçin)

Claude Code'un detaya ihtiyacı olduğunda hangi bölüme bakmalı:

| Konu                                  | Bölüm |
| ------------------------------------- | ----- |
| Bileşen mimarisi, mesaj kontratları   | 4     |
| IndexedDB şeması                      | 4.5   |
| Manifest V3 kısıtlamaları             | 4.6   |
| Locator strateji algoritmaları        | 5.2   |
| Stability scoring detayı              | 5.3   |
| Dinamik class tespiti                 | 5.4   |
| Shadow DOM / iframe handling          | 5.5   |
| IR (Intermediate Representation) spec | 6.2   |
| Page Object grouping algoritması      | 6.3   |
| Method inference pattern'leri         | 6.4   |
| Framework adapter örnek çıktıları     | 6.6   |
| Adapter SDK (yeni framework ekleme)   | 6.7   |
| Yol haritası ve milestone'lar         | 8     |
| Repo yapısı detayı                    | 12    |
| Test stratejisi detayı                | 13    |
| Glossary                              | 15    |

---

## 11. Çalışma Stili

Bu projede Claude Code'dan beklenen davranış:

- **Küçük PR'lar** — bir tool call'da 200-300 satırdan fazla diff üretme
- **TDD** — yeni feature için önce test yaz
- **Type safety first** — `any` yok, runtime'da type guard
- **Comment yerine isim** — JSDoc public API için, inline comment minimum
- **Refactor agresif olma** — task'a odaklı kal, "yan etkide şunu da düzelttim" yapma
- **Dependency eklerken sor** — `package.json`'a yeni paket eklemeden önce kullanıcıya danış
- **Build/test çalıştır ve doğrula** — kod yazıp bırakma, `npm test` çalıştır
- **Hata olunca lookup yap** — `docs/technical-design.docx`'taki ilgili bölümü oku, oradan çözüm üret

---

## 12. Mevcut Durum

> Bu bölümü her milestone sonrasında güncelle.

**Faz:** Faz 3 — devam ediyor · v0.7.0 yayında, VS Code extension shipped (16 Mayıs 2026)
**Mevcut Hafta:** P7.4 — VS Code extension v0.7.0 release (TAMAMLANDI)
**Sonraki Görev:** Faz 4 başlangıcı (planlanacak) — bkz. ROADMAP.md

**Tamamlananlar:**

- [x] Teknik tasarım dokümanı v1.0
- [x] CLAUDE.md
- [x] GitHub repo (private) + v0.1.0 release
- [x] Proje iskeleti, dist/ build, Chrome'a yüklenip açılan extension
- [x] Hafta 5 — Locator Engine production kalitesi (9 strateji)
- [x] Hafta 6 — Cypress Adapter + Adapter SDK (FrameworkAdapter / ADAPTER_REGISTRY)
- [x] Hafta 6.5 Faz 0 — Tasarım sistemi (Inter font, lucide-react, design tokens, dark mode)
- [x] Hafta 6.5 Faz 1 — Side panel chrome (gradient header, pill tabs, gradient CTA, lucide ikonlar)
- [x] Hafta 6.5 Faz 2 — İçerik komponentleri (StepList, SessionList, FrameworkPicker, AssertionBuilder, CodePreview)
- [x] Hafta 6.5 Faz 3 — Popup refresh, modal animasyonları, a11y (aria-label, reduced-motion guard)
- [x] Hafta 7 — Self-Healing Locator: IR'a `IRFallback[]` + `IRElementSnapshot`; her element üstüne idiomatic `// Fallbacks: ...` yorumu; scaffold'a `utils/locator.ts` (Playwright `selfHealingLocator`) + `cypress/support/locator.js` (`cy.selfHealing`); side panel badge "{N} fallback(s)"; README ve zip README'sine "Self-healing locators" bölümü
- [x] Hafta 8 — Method Inference v2: 10 pattern (search, login/register, submitForm, fillForm, acceptAndSubmit, navigateFromMenu, selectFromMenu, openItem, confirmAction + fallback) · `IRElement.inputType` + parametre tipi çıkarımı (`number`, `boolean`) · sayfa içi method ismi çakışmaları numerik suffix ile çözülür · default isim stratejisi (`click<Name>`, `fill<Name>`, `press<Key>`, `verify<Name>`)
- [x] Hafta 8 — Network Request Capture: yeni izin yok, MAIN-world content script (`src/content/network-proxy.ts`, `world: "MAIN"`, `run_at: "document_start"`) `window.fetch` ve `XMLHttpRequest`'i sarmalar; ISOLATED CS `playforge:network` CustomEvent'ini `EVENT_CAPTURED` olarak background'a iletir; response body cap = `NETWORK_BODY_MAX_BYTES` (50 KB)
- [x] Hafta 8 — IR'a `IRActionType: 'network'` + `IRStep.network: IRNetworkInfo`; step listesinde `Globe` ikonu ile `METHOD path STATUS` etiketi
- [x] Hafta 8 — Playwright adapter mock üretimi (`page.route(... route.fulfill(...))`); JSON body live JSON olarak kalır (`JSON.stringify(...)`), text body string literal'e dönüşür; opsiyonel `Generate` checkbox: "Include mocks for captured network requests"
- [x] Hafta 8 — Side panel `MethodPreview`: çıkarılan methodları sayfa-bazlı listeler, kullanıcı method ismini düzenleyebilir; `methodRenames: Record<"PageClass.oldName", string>` `CODE_GENERATE` mesajıyla aktarılır, codegen pipeline `applyRenames` ile uygular
- [x] Hafta 9 — Visual Regression: `AssertionType`'a `screenshot` eklendi (`AssertionSpec` & `AssertionDetail` `name` + `threshold` ile genişledi); content script suggester her elemana "Screenshot match" suggestion'u ekler; background `handleAssertionSuggestion` `chrome.tabs.captureVisibleTab` ile thumbnail çeker, `ASSERTION_SUGGESTIONS` mesajına `screenshotDataUrl` koyar; `AssertionBuilder` thumbnail + `Snapshot name` input + threshold gösterir; Playwright adapter `await expect(...).toHaveScreenshot('name.png', { threshold })` üretir, Cypress adapter `cy.matchImageSnapshot('name', { failureThreshold, failureThresholdType: 'percent' })`; Cypress scaffold `cypress-image-snapshot` dependency + plugin/command wiring + `cypress/screenshots/.gitkeep`; Playwright scaffold `tests/scenario.spec.ts-snapshots/.gitkeep`; ZIP README'de "Visual regression" bölümü
- [x] Hafta 10 — v0.5 Release: package.json `0.5.0`, CHANGELOG v0.5.0 girişi (added/performance/changed/known-limitations), README Cypress "✅ Stable" + perf tablosu (single p99 1.33ms, 1000-elem max 130ms, bundle ~478KB) + v0.5.0 badge'i, `docs/linkedin-w10-post.md` (IR mimarisi teması), git tag `v0.5.0`. `pnpm test` 248/248 passing, `pnpm build` clean. Bug bash atlandı (interaktif), GitHub release web UI'dan kullanıcı tarafından yayınlanacak.
- [x] Hafta 11–12 — Selenium Python (Pytest) Adapter: `src/codegen/adapters/selenium-py/` tam implementasyon (`locator.ts` By tuple üreticisi · `page-object.ts` `class X:` + `EMAIL_INPUT = (By.CSS_SELECTOR, '...')` constants + `__init__`/`WebDriverWait`/inferred methods · `scenario.ts` `def test_<slug>(driver):` pytest function · `scaffold.ts` requirements.txt + conftest.py (`--headed` flag, webdriver-manager) + pytest.ini + `pages/__init__.py` + `tests/__init__.py`). XPath literal'leri için tek/çift tırnak + `concat()` desteği. `FrameworkId`'ye `'selenium-py'`, registry, `FrameworkPicker` ("Selenium Python"), `sessionStore` localStorage allowlist, `SidePanelApp` butonu, `zip-export` resolveZipPath + README template güncellendi. **Python AST validation:** `python-validate.ts` `spawnSync(python3|python|py, '-c', 'import ast; ast.parse(...)')`; interpreter yoksa skip — CI'da kırmıyor. Snapshot tests + AST tests + locator unit tests = 38 yeni test, toplam **286/286 passing**. `pnpm build` clean (bundle değişmedi, Python adapter pure JS string templating). LinkedIn: `docs/linkedin-w11-12-selenium-py.md`.
- [x] P3 — Test Data Parameterization: `src/codegen/planner/sensitive-detector.ts` (`isSensitiveField`, `getParameterName`, `getEnvVarName`) detects password / token / secret / api-key / email fields via `inputType`, `autocomplete`, and IR element-name regex (case-insensitive). `IRElementSnapshot` extended with `fieldName` + `autocomplete`. `InferredMethod` carries parallel `paramSecret: boolean[]`. New `test-data-resolver.ts` builds the per-fill `ResolvedValue` (literal | env-var lookup with fallback) and seeds default `TestDataConfig`. Adapter renderers emit framework-idiomatic helpers: Playwright `process.env.X ?? "change-me"`, Cypress `Cypress.env("password") || "change-me"`, Selenium Py `os.environ.get('PLAYFORGE_PASSWORD', 'change-me')` (auto `import os`), Selenium Java `System.getenv().getOrDefault(...)`. Scaffolds gain fixture/env templates when env-var params exist (`.env.example`, `cypress.env.json.example`, conftest.py `python-dotenv`, `src/test/resources/test-data.properties.example`). Side panel **Test Data** card (`TestDataPanel.tsx`) shows each parameter with name / default value / secret toggle / "use env var" checkbox, threaded through `CODE_GENERATE.testData`. `logger.ts` redacts `password|secret|token|apiKey|…` keys before forwarding to console. `SENSITIVE_FIELD_PATTERNS`, `SENSITIVE_AUTOCOMPLETE_VALUES`, `SECRET_PARAM_DEFAULT_VALUE`, `ENV_VAR_PREFIX` added to `shared/constants.ts`. **474/474 passing**, `pnpm build` clean.

- [x] P7.1 — CLI iskeleti + `playforge add`: `src/cli/` (commander entry · `commands/add.ts` JSON → IR → render scaffold-skip · `detect-framework.ts` pom.xml/requirements.txt/package.json marker walker · `conflict-resolver.ts` `prompts`-tabanlı m/o/s/r/d + unified-diff preview · `merge/ts-page-object.ts` `@babel/parser` + `traverse` + `generator` class-method append). `vite.config.cli.ts` SSR/lib mode → `dist/cli/index.js` (143 KB), shebang Rollup `banner` ile tek kaynak; `stripShebang` transform plugin source'taki `#!` satırını siler. `package.json` `bin.playforge` + `build:cli` script + `commander`/`prompts`/`@babel/*` dependency'leri. Side panel'in mevcut JSON butonu **JSON for CLI** olarak relabel (existing `downloadJsonExport` çağırılıyor). **607/607 passing.**

- [x] P7.2 — Python + Java + Feature merge, `playforge init`, `--bdd`, v0.6.0 release: `src/cli/merge/py-page-object.ts` `spawnSync(python, '-c', 'import ast; …')` AST extractor + regex fallback (interpreter yoksa) — class member name'leri (functions + assigns + ann-assigns) çıkarır, missing olanları class body sonuna splice; `src/cli/merge/java-page-object.ts` tokenizing balanced-brace walker (javaparser JVM-only, npm port ölü) outer class body'sini bulur, methods (regex + `findMatchingBrace`) + `@FindBy` fields'i isim bazlı append; nested class detect edildiğinde `prompts`-tabanlı `overwrite ↔ skip` fallback; `src/cli/merge/feature-file.ts` `@cucumber/gherkin` (`AstBuilder` + `GherkinClassicTokenMatcher` + `Parser`, closure-based id generator) ile existing scenario title'larını parse eder, incoming'i line-by-line `Scenario:` ile parçalayıp duplicates'i (case-insensitive title) atlar — `Feature:` header asla duplicate olmaz. `src/cli/config-loader.ts` `.playforgerc.json` reader (`PlayforgeRc { framework, bdd, paths, version }`); malformed JSON null'a düşer. `src/cli/commands/init.ts` rc yazar (detection veya `--framework` ile pin). `add` komutuna `--bdd` flag — `renderBddFeature` + `renderBddSteps` reuse, routing zip-export.ts/resolveZipPath ile aynı (features/ Playwright TS, cypress/e2e/ Cypress, src/test/resources/features/ Selenium Java). Merge dispatch `mergeKindFor` ile per-framework + extension based; nested-java skip outcome `WriteOutcome` üzerinden propagate. **22 yeni CLI testi** (py/java/feature/ts mergers + detect-framework + config-loader; java testleri `prompts.inject([...])` ile interactive prompt'u mock'lar), toplam **629/629 passing**, `pnpm build:cli` clean (164 KB). package.json `0.6.0`, manifest.json `0.6.0`, CHANGELOG `[0.6.0] — 2026-05-13` (Unreleased içeriği session versioning + CLI maddeleri ile birlikte taşındı), README v0.6.0 badge + 629 tests + "Add to existing project (CLI)" bölümü + Selenium Py/Java "✅ Stable" + CLI bundle perf satırı, LinkedIn: `docs/linkedin-w14-cli.md`, git tag `v0.6.0`.

- [x] Hafta 13–14 — Selenium Java (TestNG) Adapter: `src/codegen/adapters/selenium-java/` tam implementasyon (`locator.ts` `@FindBy(css/xpath/id = "…")` üreticisi + `By.cssSelector/xpath/id(...)` ad-hoc expression · `page-object.ts` `package pages;` + `PageFactory.initElements(driver, this)` + `private WebElement <field>` + `WebDriverWait` + inferred methods (`public void login(String email, String password)`) · `scenario.ts` `package tests;` + TestNG `@BeforeMethod`/`@Test`/`@AfterMethod` + `ChromeDriver` + `-Dheaded` system property · `scaffold.ts` `pom.xml` (selenium-java 4.16, testng 7.10, webdrivermanager 5.6, surefire 3.2.5) + `testng.xml` (suite/test/packages) + `.gitignore`). Java identifier safety: reserved-word ve leading-digit field names `_` prefix ile escape. **Java syntax validation:** `java-validate.ts` lightweight bracket/string/comment walker — full javac validation Faz 4'e ertelendi. Snapshot tests + structural validation + locator + scaffold = 65 yeni test, toplam **351/351 passing**. `FrameworkId`'ye `'selenium-java'`, registry, `FrameworkPicker` ("Selenium Java"), `sessionStore` localStorage allowlist, `SidePanelApp` butonu, `zip-export` resolveZipPath (`src/main/java/pages/` + `src/test/java/tests/`) + README template (Maven `mvn test` + `-Dheaded=true`). `pnpm build` clean. LinkedIn: `docs/linkedin-w13-14-selenium-java.md`.

- [x] P7.3 — Prompt export modülü + CLI `playforge prompt` + `ConflictReporter` refactor: `src/codegen/export/prompt-export.ts` pure module — `buildPromptDocument(payload, {mode, framework, flowSlug?, redactSecrets})` → `PromptDocument` (frontmatter + 10 `PromptSection` (`mission`, `summary`, `pages`, `locator-catalogue`, `fragility`, `verification`, `mocks`, `secrets`, `self-healing`, `footer`)) + `renderPromptMarkdown(doc)` final markdown çıktısı. Sensitive value redaction `<REDACTED:PLAYFORGE_*>` placeholder + env-var contract, `assertNoLeakedSecrets()` defense-in-depth (rendered markdown'da `keyword[:=]value` regex'i — `PromptRedactionError` ile leak listesi). 3 mod: `slash` (`.claude/commands/playforge-<slug>.md` YAML frontmatter + `argument-hint` + `allowed-tools`), `claude-md` (`<!-- BEGIN/END playforge:<slug> -->` idempotent marker block, in-place replace ya da append), `prompt` (plain `prompts/<slug>.md`). `src/cli/commands/prompt.ts` CLI komutu — `runPrompt({json, projectDir, mode, slug?, framework?, redact, force, dryRun, output?})`, rc → detection fallback, dry-run stdout, force overwrite, otherwise `resolveConflict` (Markdown'da yapısal merge yok → overwrite/skip/rename). `src/codegen/apply/conflict-reporter.ts` host-agnostik kontrat: `ConflictAction`, `ConflictContext`, `ConflictDecision`, `ConflictReporter`. `src/cli/conflict-resolver.ts` `createTerminalReporter()` export'u — CLI `runAdd` `prompts` lib'ini bu seam üzerinden lazy yükler, VS Code/web playground gibi non-TTY host'lar kendi reporter'larını verir. `runAdd(opts, reporter?)` imza güncellendi; default terminal reporter import yalnızca CLI path'inde ödenir. `src/cli/index.ts`'ye `prompt` subcommand registry'si eklendi.

- [x] P7.4 — VS Code extension v0.7.0 release: `vscode-extension/` companion paketi + `src/vscode-ext/` Node-only host kodu. Build: `vite.config.vscode.ts` SSR + lib + cjs format → `vscode-extension/dist/extension.cjs` (~2.16 MB), `vscode` + `@playwright/test` + Node builtins external (native binary'ler bundle'lanmıyor), `publicDir: false` (Chrome manifest sızıntısı engellendi), `closeBundle` plugin `dist/` (Chrome ext build) → `vscode-extension/chrome-ext/` mirror; eksik `dist/` build-time warning + runtime `BundledExtensionMissingError`. Activation entry `src/vscode-ext/extension.ts` 5 komut + tree view + status bar bağlıyor. **Record orchestrator** (`commands/record.ts`): `browser-controller.ts` `chromium.launchPersistentContext(userDataDir, {headless:false, args:['--load-extension=…', '--disable-extensions-except=…']})`, MV3 SW headless'de başlamadığı için non-headless zorunlu; `recording-bridge.ts` `findServiceWorker(context, 10s)` (mevcut → `on('serviceworker')` fallback) + `extractFromServiceWorker(context, sessionId?)` `worker.evaluate(() => globalThis.__playforgeExport(id))` ile tagged shape (`{ok, payload}` / `{ok:false, error}`) + `waitForExport(context, stopSignal)` "Stop & Apply" notification ↔ `context.on('close')` race — kapama HİÇ hang etmiyor (edge case). `NoStepsRecordedError` friendly mesaj, `BundledExtensionMissingError` remediation komutu. JSON payload `<workspace>/.playforge/sessions/<slug>_<ts>.json`'a yazılır (audit + tree view kaynağı). **Output Picker webview** (`output-picker.ts` + `output-picker-html.ts`): tek HTML doc, CSP locked (`default-src 'none'`, `script-src 'nonce-<rand>'`, `style-src ${cspSource} 'unsafe-inline'`), nonce `crypto.randomUUID()`, JSON payload `</script>`/`<!--` escape edilerek inline script'e gömüldü. Checkboxes: test code, BDD, network mocks (sadece network step varsa enabled), Claude prompt (3 mod radio), redact. `sanitizeChoices()` server-side clamp. `Esc` cancel, `Ctrl+Enter` apply. **Conflict reporter (VS Code flavour)**: `apply-json.ts`'de QuickPick — Merge (canMerge'e göre)/Overwrite/Skip/Write `.new`/Show diff (`vscode.diff` left=file, right=untitled buffer). `pipeConsoleToOutput()` `runAdd`'ın `console.*` log'larını PlayForge `OutputChannel`'a yönlendirir, finally restore. **applyJsonAtPath helper'ı** export edildi — record.ts ve apply-json.ts ortak kullanıyor. **Recordings tree view** (`tree-provider.ts`): activity-bar view container, monochrome `currentColor` SVG (icons/playforge-sidebar.svg, 24×24), `RecordingsTreeProvider` `<root>/.playforge/sessions/*.json` listeler newest-first by mtime; `RecordingTreeItem` label=`session.name` desc=`<n> steps · <date>` icon=`play-circle` ThemeIcon contextValue=`playforgeRecording` click→apply. Welcome view empty state (`No recordings yet — Record a flow` linki + `.playforge/sessions/` açıklaması). `createFileSystemWatcher` create/change/delete auto-refresh. Context menu: Apply / Delete (inline) + Reveal in File Explorer (`revealFileInOS`). Bozuk JSON sessizce skip — tek dosya tüm tree'yi kırmaz. **Status bar**: `$(record) PlayForge [· <framework>]` idle, `$(sync~spin) PlayForge: <task>` busy; workspace folder değişiminde framework label yenilenir. **`EXPORT_REQUEST`/`EXPORT_RESPONSE`** message types `src/shared/types/messages.ts`'ye eklendi, `case 'EXPORT_REQUEST'` `message-router.ts`'ye eklendi (fire-and-forget — gerçek path `globalThis.__playforgeExport` SW global). `src/background/export-handler.ts` `handleExportRequest(sessionId?)` Dexie'den session+actions çekip `buildJsonExport` döner; `null` = no recording. `src/background/index.ts` `globalThis.__playforgeExport = handleExportRequest`. **Packaging**: `pnpm package:vscode` `scripts/package-vscode.mjs` driver ile `@vscode/vsce`'yi çağırır (cmd/PowerShell/bash uyumlu), `releases/playforge-0.7.0.vsix` üretir. `vscode-extension/LICENSE` (MIT) + `.vscodeignore` (sourcemap exclude). package.json `0.7.0`, manifest.json `0.7.0`, CHANGELOG `[0.7.0] — 2026-05-16`, README v0.7.0 badge + 661 tests + VS Code section, LinkedIn: `docs/linkedin-w15-vscode.md`. **661/661 passing**, `pnpm build` clean (Chrome ext), `pnpm build:vscode` clean (~2.16 MB CJS), `pnpm package:vscode` VSIX clean.

> Bütün haftalık görevler için: `ROADMAP.md`
