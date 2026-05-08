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

**Faz:** Faz 2 — TAMAMLANDI · v0.5.0 release atıldı (8 Mayıs 2026)
**Mevcut Hafta:** Hafta 10 — v0.5 Release (TAMAMLANDI)
**Sonraki Görev:** Faz 3 Hafta 11–12 — Selenium Python (Pytest) adapter + project scaffold

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

> Bütün haftalık görevler için: `ROADMAP.md`
