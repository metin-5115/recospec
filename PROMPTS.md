# PlayForge — Claude Code Prompt Kütüphanesi

> Her prompt bağımsızdır. Yeni bir sohbet veya Claude Code oturumu açtığınızda
> ilgili prompt'u olduğu gibi yapıştırın.
>
> **Her prompt öncesi:** CLAUDE.md projenizin kökünde, teknik doküman
> docs/technical-design.docx konumunda olmalı.
>
> **Güncelleme:** Bir görev tamamlandığında CLAUDE.md'nin "12. Mevcut Durum"
> bölümünü güncelleyin.

---

## FAZ 1 — MVP (Hafta 1–4)

---

### HAFTA 1 — GÖREV 1 ✅ TAMAMLANDI

> Vite + CRXJS iskelet kurulumu. Zaten yapıldı.

---

### HAFTA 1 — GÖREV 2 ✅ VERİLDİ

> Event capture, basit locator engine, storage layer, side panel.
> Şu an bu prompt çalışıyor.

---

### HAFTA 1 — GÖREV 3

**Ne zaman:** Görev 2 tamamlandıktan hemen sonra, aynı hafta.
**Claude Code'a ver.**

```
CLAUDE.md ve docs/technical-design.docx Bölüm 6.1, 6.2, 6.3'ü oku.
Hafta 1 — Görev 3: Temel Code Generation Pipeline.

Şu ana kadar yapılanlar:
- Content script event yakalıyor
- IndexedDB'ye RecordedAction yazılıyor
- Side panel adımları listeliyor

Şimdi bu adımları Playwright TypeScript koduna çevirecek minimum codegen
pipeline'ı yazacağız. Detaylı değil — v0.1 kalitesi, ama çalışan.

YAPILACAKLAR:

1. src/codegen/ir/types.ts — Minimum IR tipleri:
   - IRDocument, IRPage, IRElement, IRStep, IRScenario
   - Bölüm 6.2'deki full spec'in subset'i — şimdilik sadece navigate,
     click, fill, assert action type'ları yeterli

2. src/codegen/normalizer/action-normalizer.ts:
   - RecordedAction[] → IRDocument dönüşümü
   - Ardışık fill'leri merge et (aynı element, aynı sayfa)
   - navigate action'larını tespit et
   - url-normalizer.ts: /users/123 → /users/:id dönüşümü

3. src/codegen/planner/page-grouper.ts:
   - normalize edilmiş URL'e göre action'ları IRPage'lere grupla
   - Bölüm 6.3.1 ve 6.3.3 naming convention'ını uygula
   - Örnek: /login → LoginPage, /dashboard → DashboardPage

4. src/codegen/planner/element-namer.ts:
   - IRElement için anlamlı camelCase isim üret
   - Öncelik: testId → aria-label → text → tag+type
   - Suffix: Input, Button, Link, Select, (generic için yok)

5. src/codegen/adapters/playwright-ts/index.ts:
   - renderPageObject(page: IRPage): string — tek dosya, tam class
   - renderScenario(scenario: IRScenario): string — test dosyası
   - Bölüm 6.6.2'deki örnek çıktıyı referans al (LoginPage.ts ve
     login.spec.ts)

6. src/codegen/index.ts — orchestrator:
   - generate(sessionId: string, framework: 'playwright-ts'): GeneratedCode
   - IndexedDB'den action'ları çek → normalizer → planner → adapter → döndür

7. SIDE PANEL güncelle — src/side-panel/:
   - "Generate Code" butonu ekle (FrameworkPicker henüz yok, sadece
     Playwright TS hard-coded)
   - Kod preview alanı — CodePreview.tsx component
   - Copy to clipboard butonu

8. BACKGROUND güncelle — codegen-orchestrator.ts:
   - CODE_GENERATE mesajını handle et
   - Sonucu CODE_GENERATED mesajıyla UI'ya push et

9. UNIT TESTS:
   - src/codegen/normalizer/action-normalizer.test.ts (5 test)
   - src/codegen/planner/page-grouper.test.ts (4 test)
   - src/codegen/adapters/playwright-ts/page-object.test.ts
     (snapshot test — toMatchSnapshot kullan)
   - pnpm test çalıştır, hepsi geçsin

10. MANUEL TEST:
    pnpm build → Chrome reload → Side panel aç → Start Recording →
    file:// ile basit bir HTML sayfasını aç (içinde data-testid'li
    input ve button olsun — test için küçük bir HTML dosyası yaz) →
    click ve fill yap → Stop Recording → Generate Code →
    Preview'da Playwright kodu görünüyor mu? → Copy →
    Gerçekten compile oluyor mu? (tsc --noEmit ile kontrol)

KAÇIN:
- Full method inference şimdi gerek yok (Hafta 8'e sakla)
- FrameworkPicker UI şimdi gerek yok (Hafta 10'a sakla)
- Network capture şimdi gerek yok (Faz 2'ye sakla)

Her büyük adımdan sonra commit at. Bitince özet ver.
```

---

### HAFTA 1 — GÖREV 4

**Ne zaman:** Hafta sonunda, Görev 3 bittikten sonra.
**Claude Code'a ver.**

```
CLAUDE.md'yi oku. Hafta 1 — Görev 4: UX Cilası ve İlk Release Hazırlığı.

Şu ana kadar yapılanlar:
- Extension çalışıyor, event yakalıyor
- IndexedDB'ye yazıyor
- Playwright kodu üretiyor ve preview'da gösteriyor

Bu görevde kodu değil, kullanıcı deneyimini iyileştiriyoruz.

YAPILACAKLAR:

1. RECORDING STATE GÖSTERGESİ — tüm UI'da tutarlı:
   - Popup: büyük "● REC" kırmızı badge veya "○ IDLE" gri badge
   - Side panel başlığı yanında aynı gösterge
   - İkon: extension toolbar ikonunu recording sırasında farklı yap
     (chrome.action.setIcon ile kırmızı versiyon)

2. STEP LIST iyileştirmeleri:
   - Her adım için ikon (click → 👆, fill → ✏️, navigate → 🧭)
   - Adım üstüne hover'da locator strategy badge'i göster
     (örn. "testid" veya "role" küçük etiketle)
   - Adım silme butonu (×) — sağda, hover'da görünür
   - Adım sayacı — "3 adım kaydedildi"

3. EMPTY STATE:
   - Side panel henüz kayıt yoksa: büyük ikon + "Start recording to
     capture steps" mesajı + "Open a page" hint'i

4. ERROR HANDLING:
   - Generate Code başarısız olursa kullanıcıya anlaşılır hata mesajı
   - Service worker uyanmazsa retry mekanizması (max 3 deneme)

5. EXPORT:
   - "Copy to Clipboard" butonunun yanına "Download .ts" butonu ekle
     — tek dosya olarak download

6. README.md — minimum ama paylaşılabilir:
   - Bir paragraflık proje açıklaması
   - Tech stack satırı
   - "Install from source" kurulum adımları (clone + pnpm install +
     pnpm build + Chrome'a yükle)
   - Supported frameworks tablosu (şimdilik sadece Playwright ✅,
     diğerleri "Coming soon")
   - Screenshot veya GIF placeholder (Faz 1 launch'ta dolduracaksınız)
   - License + Contributing link

7. CHANGELOG.md — ilk versiyonu yaz:
   - ## [0.1.0] - 2026-XX-XX
   - ### Added listesi

8. PACKAGE.JSON düzelt:
   - version: "0.1.0"
   - description ekle
   - keywords ekle: ["chrome-extension", "test-automation", "playwright",
     "codeless", "page-object-model"]
   - repository, author, license alanları

9. pnpm build çalıştır, dist/ temiz build veriyor mu?
10. Chrome'a reload et, tüm UI'ı baştan sona test et.
11. Tüm değişiklikleri commit et, tag at: git tag v0.1.0 && git push --tags

Bitince özet ver: hangi UX iyileştirmeleri yapıldı, README hazır mı,
tag atıldı mı.
```

---

## FAZ 1 — HAFTA 2

---

### HAFTA 2 — GÖREV 1

**Ne zaman:** Yeni hafta başı, yeni Claude Code oturumu.
**Claude Code'a ver.**

```
CLAUDE.md ve docs/technical-design.docx Bölüm 5.2 (tüm stratejiler),
5.3 (scoring), 5.4 (dinamik class tespiti) bölümlerini oku.
Hafta 2 — Görev 1: Locator Engine Genişletme (9 stratejinin tamamı).

Şu ana kadar sadece TestId stratejisi var. Bu görevde kalan 8 stratejiyi
ekleyeceğiz ve scoring sistemini aktif hale getireceğiz.

YAPILACAKLAR:

1. src/locator-engine/strategies/ — her strateji ayrı dosya:

   a) test-attributes.ts — data-test, data-cy, data-qa, data-automation
      (Bölüm 5.2.2)

   b) aria-label.ts — aria-label + aria-labelledby resolution
      (Bölüm 5.2.3 — algorithm'ı aynen uygula)

   c) role-name.ts — implicit/explicit role + accessible name
      (Bölüm 5.2.4 — computeImplicitOrExplicitRole ve
       computeAccessibleName fonksiyonları)

   d) role-table.ts — WAI-ARIA implicit role lookup tablosu
      (Bölüm 5.2.4 — en az 30 entry: button, a[href], input türleri,
       select, textarea, h1-h6, nav, main, aside, dialog, form, img,
       table, thead, tbody, tr, th, td, ul, ol, li)

   e) label.ts — explicit for= association + wrapping label
      (Bölüm 5.2.5 — iki mekanizma da)

   f) text.ts — visible text content
      (Bölüm 5.2.6 — max 100 char, trim + collapse whitespace,
       exact match default)

   g) id.ts — element id attribute
      (Bölüm 5.2.7 — isDynamicId fonksiyonunu tam uygula: UUID,
       CSS-in-JS, numeric suffix, entropy heuristic)

   h) css.ts — minimal CSS selector builder
      (Bölüm 5.2.8 — dynamic class'ları at, parent context ekle,
       uniqueness kontrol et)

   i) xpath.ts — relative XPath (son çare)
      (Bölüm 5.2.9 — absolute XPath üretirse kullanıcıya warning flag)

2. src/locator-engine/scoring/:

   a) dynamic-detector.ts:
      - isDynamicClass(cls: string): boolean
      - isDynamicId(id: string): boolean
      - Bölüm 5.4'teki tüm pattern'ler (css-, jss-, sc-, Mui, entropy)

   b) uniqueness.ts:
      - computeUniqueness(selector, doc): 0 | 50 | 100
      - 1 eşleşme → 100, 2-3 → 50, 4+ → 0

   c) semantic-strength.ts:
      - STRATEGY_BASE_SCORE map (testid:100, aria-label:85, role:85,
        label:80, text:60, id:70, css:30, xpath:10)

   d) stability-scorer.ts:
      - score(candidate, element, doc): number
      - Formülü uygula: uniqueness*0.4 + semantic*0.3 +
        stability*0.2 + depth*0.1
      - depth: selector'daki combinator sayısından hesapla

3. src/locator-engine/selector.ts — LocatorSelector:
   - select(scored: ScoredLocator[]): LocatorBundle
   - En yüksek skorlu → primary
   - 2. ve 3. → fallbacks
   - Geri kalanlar → rejected (debug için)

4. src/locator-engine/index.ts — LocatorEngine güncelle:
   - evaluate(element, doc): LocatorBundle
   - Tüm 9 stratejiyi paralel çalıştır
   - Scorer'dan geçir, selector'a ver

5. UNIT TESTS (her strateji için):
   src/locator-engine/strategies/__tests__/ klasörü aç:
   - testid.test.ts — zaten var, gözden geçir
   - aria-label.test.ts — 5 test
   - role-name.test.ts — 5 test (button, link, input, combobox, dialog)
   - label.test.ts — 4 test (explicit for=, wrapping label, negative)
   - text.test.ts — 4 test (normal, too long, whitespace normalization)
   - id.test.ts — 6 test (static id, UUID, css-hash, Mui pattern,
     numeric suffix, entropy)
   - dynamic-detector.test.ts — 8 test (her pattern için)
   - stability-scorer.test.ts — 5 test (formülü doğrula)

   pnpm test çalıştır — hepsi yeşil.
   pnpm test --coverage çalıştır — locator-engine %85+ olmalı.

6. BENCHMARK FIXTURE — benchmarks/fixtures/ klasörünü oluştur:
   - simple-form/snapshot.html: basit login formu
     (email input, password input, submit button, data-testid'li)
   - simple-form/expected.json: email için beklenen strateji 'testid',
     password için 'testid', button için 'role-name'
   - material-ui-like/snapshot.html: dinamik class'lı form
     (css-1a2b3c, MuiButton-root-89 gibi class'larla)
   - material-ui-like/expected.json: engine'in css/xpath'e düşmemesi
     gerektiğini belirten min score değerleri

7. Fixture runner testi ekle:
   src/locator-engine/__tests__/benchmark.test.ts
   (Bölüm 13.2.2'deki örnek pattern'i uygula)

8. pnpm build → Chrome reload → data-testid olmayan bir formda
   extension'ı dene, side panel'de locator strategy badge'inin
   doğru stratejileri gösterdiğini kontrol et.

Her grup bittikçe commit at. Bitince coverage raporunu paylaş.
```

---

### HAFTA 2 — GÖREV 2

**Ne zaman:** Görev 1'den 1-2 gün sonra.
**Claude Code'a ver.**

```
CLAUDE.md ve docs/technical-design.docx Bölüm 6.3 (page grouping),
6.4 (method inference), 5.5 (shadow DOM) bölümlerini oku.
Hafta 2 — Görev 2: Page Object Model Üretimi ve Method Inference.

YAPILACAKLAR:

1. src/codegen/planner/page-grouper.ts — tam implementasyon:
   - URL normalizasyonu (Bölüm 6.3.1 — tam algoritma):
     query string at, fragment at, trailing slash normalize,
     sayısal segment → :id, UUID segment → :uuid
   - Page identity tespiti: title tag + data-page attribute
   - Collision detection: aynı pattern'de farklı title → uyarı flag

2. src/codegen/planner/method-inferer.ts — Bölüm 6.4:
   - Pattern tablosundaki 5 pattern'i tanı:
     * fill+fill+click(submit) → login(email, password)
     * fill+select+fill+click → submitForm(...)
     * click+navigate → openItem(name)
     * click+click (menu pattern) → selectFromMenu(option)
     * fill+Enter → search(query)
   - Tanınan pattern'den parametre ismi çıkar (Bölüm 6.4.2)
   - Tanınmayan sequence → raw method adı (doAction + index)

3. src/codegen/adapters/playwright-ts/ — tam Page Object çıktısı:
   - renderPageObject: method inference kullan, her element için
     locator property + fallback yorum olarak
   - renderScenario: fixture import + test.describe + test blokları
   - renderScaffold: package.json, playwright.config.ts, tsconfig.json
     (zip export için)

4. SIDE PANEL güncelle:
   - Code preview'da dosya sekmeleri: "LoginPage.ts" | "login.spec.ts"
   - Her dosya ayrı sekme olarak görünsün
   - Locator badge'i tıklanabilir yap: tıklanınca o element için
     alternatif locator'ları dropdown olarak göster (fallback'ler)

5. UNIT TESTS:
   - page-grouper.test.ts — 6 test (/login, /users/123, /orders/uuid,
     dynamic query string, fragment, title collision)
   - method-inferer.test.ts — 5 test (her pattern için 1 test)
   - playwright-ts/page-object.test.ts — snapshot'u güncelle

6. INTEGRATION TEST:
   src/codegen/__tests__/pipeline.test.ts:
   - Tam bir login flow için fixture RecordedAction dizisi oluştur
   - Pipeline'dan geçir (normalizer → planner → adapter)
   - Çıktı LoginPage.ts ve login.spec.ts dosyası içermeli
   - Her iki dosya tsc --noEmit ile hatasız compile olmalı

7. MANUEL TEST:
   - Çok sayfalı bir flow kaydedebiliyor musun? (login → dashboard)
   - İki sayfa için iki ayrı Page Object üretiliyor mu?
   - Method inference login pattern'ini tanıyor mu?

pnpm test && pnpm build. Commit at.
```

---

### HAFTA 2 — GÖREV 3

**Ne zaman:** Haftanın son günü.
**Claude Code'a ver.**

```
CLAUDE.md oku. Hafta 2 — Görev 3: Assertion Builder.

YAPILACAKLAR:

1. src/shared/types/action.ts — assertion action tipini genişlet:
   AssertionSpec: { type: 'visible' | 'hidden' | 'text' | 'value' |
   'attribute' | 'count', target: Locator, expected?: string | number }

2. CONTENT SCRIPT — assertion mode:
   - element-probe.ts: hover'da element'i highlight et
     (semi-transparent overlay, CSS outline, pointer cursor)
   - Kullanıcı tıkladığında o element için assertion önerileri üret:
     * Element görünür → "Expect visible" öner
     * Metin içeriyorsa → "Expect text: '...'" öner
     * Input ise → "Expect value: '...'" öner
   - Önerileri background'a ASSERTION_SUGGESTION mesajıyla gönder

3. SIDE PANEL — AssertionBuilder.tsx component:
   - Küçük modal/dropdown şeklinde açılır
   - Önce suggestion listesi göster (content script'ten gelen)
   - Kullanıcı seçer veya özel değer girer
   - "Add Assertion" ile step listesine eklenir
   - Assert step'i step listesinde farklı ikon ile göster (✓)

4. CODEGEN güncelle — assertion çıktıları:
   - Playwright: await expect(locator).toBeVisible()
                 await expect(locator).toHaveText('...')
                 await expect(locator).toHaveValue('...')
   - Her assertion tipi için doğru Playwright matcher'ı üret

5. UNIT TESTS:
   - assertion-builder component testi (React Testing Library)
   - codegen assertion output'u için snapshot test

6. MANUEL TEST:
   - Kayıt sırasında bir elemana sağ tıkla (veya assertion mode'u aç)
   - Öneri listesi çıkıyor mu?
   - Seçilen assertion step listesine ekleniyor mu?
   - Generate edince expect bloğu koda giriyor mu?

pnpm test && pnpm build. Commit at.
```

---

## FAZ 1 — HAFTA 3

---

### HAFTA 3 — GÖREV 1

**Ne zaman:** Hafta başı.
**Claude Code'a ver.**

```
CLAUDE.md ve docs/technical-design.docx Bölüm 5.5 (Shadow DOM, iframe),
4.5 (IndexedDB şeması — full spec), 4.7.2 (hata yönetimi) bölümlerini oku.
Hafta 3 — Görev 1: Shadow DOM, Iframe Desteği ve Hata Yönetimi.

YAPILACAKLAR:

1. src/content/shadow-pierce.ts:
   - Open shadow root tespit: element.shadowRoot !== null
   - Shadow içindeki element için locator path: 'host >>> target' notation
   - Closed shadow root için: SHADOW_CLOSED warning flag ekle,
     kullanıcıya side panel'de uyarı göster
   - Iframe tespit: element.ownerDocument !== document
   - Iframe'in frame URL ve name/title'ını kaydet

2. src/locator-engine/index.ts güncelle:
   - Shadow DOM için piercing locator desteği
   - Iframe chain tracking (frameChain: string[])
   - evaluate'e ShadowOptions parametresi ekle

3. CODEGEN güncelle — Playwright çıktıları:
   - Shadow DOM: page.locator('host').locator('target')
   - Iframe: page.frameLocator('iframe[name="x"]').getByLabel('...')
   - Bölüm 5.5.1 ve 5.5.2'deki örnek çıktıları referans al

4. ERROR HANDLING — Bölüm 4.7.2'yi uygula:
   - Tüm async işlemleri try/catch ile sar
   - Content script crash olursa background max 3 kez re-inject dener
   - Service worker terminate olursa chrome.runtime.onSuspend'de cleanup
   - UI'da error boundary — component crash olursa "Something went wrong,
     please reload" mesajı, extension crash etmesin

5. STORAGE tam implementasyon — Bölüm 4.5.4:
   - Write-through cache: her action IndexedDB'ye anında yazılsın
   - Garbage collection: 30 günden eski 'archived' session'ları sil
   - Quota check: navigator.storage.estimate() ile %80 dolunca uyar

6. UNIT TESTS:
   - shadow-pierce.test.ts — 4 test (open shadow, closed shadow,
     iframe tespit, nested frame)
   - error-handling: background retry logic testi

7. MANUEL TEST:
   - Web component kullanan bir site var mı test ortamında?
     Yoksa: shadow DOM'lu bir test HTML dosyası yaz, dene.
   - Extension crash simulate et (content script'te intentional throw),
     recovery çalışıyor mu?

pnpm test && pnpm build. Commit at.
```

---

### HAFTA 3 — GÖREV 2

**Ne zaman:** Görev 1'den bir gün sonra.
**Claude Code'a ver.**

```
CLAUDE.md oku. Hafta 3 — Görev 2: Session Yönetimi ve Export.

YAPILACAKLAR:

1. SESSION YÖNETİMİ tam implementasyon:
   - Session listesi: side panel'de geçmiş session'ları listele
   - Session silme ve yeniden adlandırma
   - Session durumu badge'leri: recording / paused / stopped / archived
   - Pause/Resume desteği: kayıt sırasında duraklat, devam et
   - Multi-session: aynı anda farklı tab'larda bağımsız session'lar

2. EXPORT seçenekleri:
   - JSON export: ham RecordedAction dizisi + metadata
     (debug ve replay için)
   - ZIP export (Bölüm 6.9 — multi-file):
     * pages/ klasörü: her sayfa için ayrı .ts dosyası
     * tests/ klasörü: test senaryoları
     * package.json: minimum Playwright bağımlılıkları
     * playwright.config.ts: hazır config
     * README.md: "Bu kodu nasıl çalıştırırsınız"
   - ZIP oluşturma için jszip paketini kullan (önce bana sor)

3. SESSION STORAGE optimizasyonu:
   - Büyük session'lar için action'ları chunk'lara böl
   - IndexedDB cursor ile lazy load — tümünü belleğe alma

4. UNIT TESTS:
   - session-repo.test.ts — pause/resume state geçişleri
   - zip-export.test.ts — üretilen ZIP içinde doğru dosyalar var mı

5. MANUEL TEST:
   - Bir session kaydet, JSON export et, içeriği kontrol et
   - ZIP export et, klasör yapısını kontrol et
   - İçindeki Playwright kodunu gerçek bir Playwright projesinde çalıştır

pnpm test && pnpm build. Commit at.
```

---

### HAFTA 3 — GÖREV 3

**Ne zaman:** Haftanın son 1-2 günü.
**Claude Code'a ver.**

```
CLAUDE.md oku. Hafta 3 — Görev 3: CI/CD ve Test Altyapısı.

YAPILACAKLAR:

1. GitHub Actions — .github/workflows/:

   a) ci.yml — Her PR'da çalışır:
      - Node 20 setup
      - pnpm install --frozen-lockfile
      - pnpm typecheck
      - pnpm lint
      - pnpm test --coverage
      - pnpm build
      - Coverage yüzdesini PR comment'e yaz (Coverage threshold: %75)

   b) e2e.yml — main branch'e merge'de çalışır:
      - pnpm build
      - Playwright kurulumu (chromium only)
      - pnpm e2e
      (E2E testleri henüz minimal olsa da pipeline hazır olsun)

   c) release.yml — v* tag push'unda çalışır:
      - pnpm build
      - dist/ klasörünü zip'le
      - GitHub Release oluştur, zip'i asset olarak ekle

2. E2E TEST ALTYAPISI:
   playwright.config.ts:
   - baseURL: yok (extension test eder)
   - use: { headless: false } — extension test için
   - timeout: 30000
   - retries: 1 (CI'da)

   tests/e2e/helpers/extension.ts:
   - loadExtension(): Playwright context factory
     (chromium.launchPersistentContext + --load-extension=dist/)
   - getServiceWorker(): background service worker'a erişim

   tests/e2e/recording.spec.ts — ilk e2e test:
   - Extension yükle
   - Test HTML sayfasını aç (tests/fixtures/simple-form.html)
   - Kayıt başlat, 3 adım yap, durdur
   - "Generate Code" tıkla
   - Code preview'da Playwright kodu görünüyor mu? (basit text check)
   Bu test CI'da "pending" kalabilir, önemli olan altyapının hazır olması.

3. vitest.config.ts güncelle:
   - coverage: { provider: 'v8', threshold: { global: 75 } }
   - exclude: ['tests/e2e/**', 'benchmarks/**']

4. package.json'a ekle:
   - "test:e2e": "playwright test"
   - "test:ci": "vitest run --coverage"
   - "pretest": "tsc --noEmit"

5. README.md'yi güncelle — Contributing bölümü ekle:
   - Kurulum adımları
   - Test komutları
   - PR sürecine kısa not

pnpm test:ci çalıştır — yeşil. pnpm build — temiz. Commit at.
```

---

## FAZ 1 — HAFTA 4

---

### HAFTA 4 — GÖREV 1

**Ne zaman:** Hafta başı.
**Claude Code'a ver.**

```
CLAUDE.md ve docs/technical-design.docx Bölüm 14.1 (README şablonu),
8.9 (v1.0 release checklist) bölümlerini oku.
Hafta 4 — Görev 1: Profesyonel README ve Dokümantasyon.

YAPILACAKLAR:

1. README.md — Bölüm 14.1'deki şablonu uygula:
   - Hero bölümü: Proje adı, one-liner, badge satırı
     (build: GitHub Actions badge, license: MIT badge,
      version: package.json'dan)
   - GIF placeholder section: "[Demo GIF — coming soon]"
   - Why PlayForge: 3-4 cümle, mevcut araçlardan fark
   - Features: 6 madde, kısa
   - Quick Start: 3 adım (install from source / record / export)
   - Supported Frameworks tablosu:
     | Framework | Language | Status |
     | Playwright | TypeScript | ✅ Stable |
     | Cypress | JavaScript | 🔜 Coming in v0.5 |
     | Selenium | Python | 📋 Planned |
     | Selenium | Java | 📋 Planned |
   - Installation (from source)
   - Contributing link
   - License

2. CONTRIBUTING.md — Bölüm 14.4'teki şablonu uygula:
   - Welcome
   - Prerequisites
   - Setup adımları
   - Klasör yapısı açıklaması (kısa)
   - Commit convention
   - PR süreci
   - Test ekleme rehberi
   - Code of Conduct linki

3. CODE_OF_CONDUCT.md:
   - Contributor Covenant v2.1 standart şablonunu kullan
   - Contact email placeholder ekle

4. CHANGELOG.md güncelle:
   - ## [Unreleased]
   - ## [0.1.0] - bugünün tarihi
     ### Added — tüm v0.1.0 özelliklerini listele

5. docs/ klasörüne şunları ekle:
   - ARCHITECTURE.md: Bölüm 4'teki ASCII diyagramını + 1 sayfalık özet
   - DECISIONS.md: Verilen 10 mimari kararın kısa listesi
     (her biri: Karar — Gerekçe — Alternatifler 3 satır)

6. src/shared/constants.ts oluştur:
   - Tüm magic sayıları ve string'leri buraya taşı
   - MAX_SESSION_AGE_MS, STORAGE_QUOTA_WARNING_PERCENT,
     LOCATOR_MAX_DEPTH, DYNAMIC_CLASS_ENTROPY_THRESHOLD...
   - Mevcut kodda hardcoded olan her değeri bul, buraya taşı

7. pnpm build çalıştır, dist/ temiz mi?
8. README'yi tarayıcıda preview et (VS Code / editör markdown preview)

Commit: "docs: complete README, CONTRIBUTING, and architecture docs"
```

---

### HAFTA 4 — GÖREV 2 — LAUNCH

**Ne zaman:** Haftanın ortası — bu milestone'un en özel anı.
**Claude Code'a ver.**

```
CLAUDE.md oku. Hafta 4 — Görev 2: v0.1.0 Launch Hazırlığı.

Bu görev kod değil, launch pipeline'ı.

YAPILACAKLAR:

1. DEMO TEST HTML sayfası — tests/fixtures/demo-page.html:
   Gerçekçi bir login formu:
   - Email input (data-testid="login-email", aria-label="Email Address",
     label bağlantısı)
   - Password input (data-testid="login-password")
   - Remember me checkbox (data-testid="remember-me")
   - Submit button (data-testid="submit-login", role=button,
     text="Sign In")
   - Basit validation mesajları
   Bu sayfa GIF çekimi için kullanılacak.

2. PACKAGE VERSION:
   - package.json: version "0.1.0"
   - manifest.json: version "0.1.0"
   - Tutarlılık kontrolü yap

3. PRODUCTION BUILD kontrolü:
   - pnpm build
   - dist/ boyutu ne? (500KB altında olmalı)
   - manifest.json dist/'te doğru mu?
   - Tüm entry point'ler var mı (popup.html, side-panel.html)?

4. GIT TAG:
   git add .
   git commit -m "release: v0.1.0 — initial MVP release"
   git tag -a v0.1.0 -m "PlayForge v0.1.0 — MVP release

   Features:
   - Chrome extension with Manifest V3
   - 9 locator strategies with stability scoring
   - Page Object Model generation
   - Playwright TypeScript output
   - Assertion builder
   - Session management and export (JSON + ZIP)"
   git push && git push --tags

5. GITHUB RELEASE:
   - GitHub'a git, Releases → Draft new release
   - Tag: v0.1.0
   - Title: "PlayForge v0.1.0 — MVP"
   - Description: CHANGELOG.md'deki v0.1.0 içeriği
   - dist/ klasörünü zip'leyip asset olarak ekle

6. REPO'YU PUBLIC YAP:
   - GitHub repo Settings → Danger Zone → Change visibility → Public
   - Bu adımı son olarak yap (her şey hazır olduktan sonra)

7. LINKEDIN POST TASLAĞINI HAZIRLA:
   docs/technical-design.docx Bölüm 14.3'teki taslağı al,
   şunları özelleştir:
   - "[username]" → gerçek GitHub kullanıcı adı
   - "[DEMO GIF]" satırını şimdilik "[screenshot eklenecek]" bırak
   - Tarihi bugün yap
   LinkedIn post'unu docs/linkedin-launch-post.md olarak kaydet.

Bitince özet ver:
- Repo public mi?
- Tag atıldı mı?
- GitHub release var mı?
- LinkedIn post hazır mı?
```

---

## FAZ 2 — AKILLILIŞMA (Hafta 5–10)

> Faz 2 prompt'ları Faz 1 tamamlandıktan sonra kullanılır.
> Her haftanın başında CLAUDE.md'nin "Mevcut Durum" bölümünü güncelleyin.

---

### HAFTA 5 — Locator Engine Production Kalitesi

```
CLAUDE.md ve docs/technical-design.docx Bölüm 5.3, 5.6, 5.7 bölümlerini oku.
Hafta 5: Locator Engine Production Kalitesi.

YAPILACAKLAR:

1. Gerçek dünya site'larından 3 yeni benchmark fixture ekle:
   - benchmarks/fixtures/react-todomvc/ — TodoMVC React versiyonu
     (https://todomvc.com/examples/react/ adresinden HTML al)
   - benchmarks/fixtures/bootstrap-form/ — Bootstrap form
   - benchmarks/fixtures/tailwind-form/ — Tailwind CSS form
   Her biri için expected.json ekle.

2. Benchmark test runner'ı güncelle:
   - Tüm fixture'ları döngüde çalıştır
   - Her fixture için başarı oranını hesapla (expected vs actual)
   - Başarı oranı %80 altında olan fixture'lar için test fail et

3. Bölüm 5.7'deki edge case'leri handle et:
   - Canvas/WebGL: locator üretemez → "manual-coordinate" action tipi ekle
   - Hover-only menüler: hover yakalanıyor ama warning flag ekle
   - 100+ char text: text strategy reddetsin (zaten var, test yaz)
   - React Portal: parent context kaybolunca minimum fallback üret

4. Accessibility tree entegrasyonu:
   - computeAccessibleName fonksiyonunu ARIA spec'e uygun yaz
   - aria-describedby da fallback olarak ekle
   - Strateji olarak değil, mevcut role-name strategy'nin parçası olarak

5. Performance benchmark:
   benchmarks/performance.test.ts:
   - Tek locator hesaplama < 5ms (p99) — jsdom üzerinde 100 iterasyon
   - 1000 element'lik DOM'da engine < 500ms
   - Test fail etse de ölçüm rapora yazılsın

6. Coverage: pnpm test --coverage → locator-engine %85+ zorunlu.

pnpm test && pnpm build. Commit at.
```

---

### HAFTA 6 — Cypress Adapter

```
CLAUDE.md ve docs/technical-design.docx Bölüm 6.6.3 (Cypress çıktı örneği),
6.7 (Adapter SDK) bölümlerini oku. Hafta 6: Cypress Adapter.

YAPILACAKLAR:

1. Adapter SDK'yı formalize et — src/codegen/adapters/registry.ts:
   - ADAPTER_REGISTRY map
   - FrameworkAdapter interface (Bölüm 6.7.1)
   - registerAdapter() fonksiyonu

2. Playwright adapter'ı refactor et:
   - FrameworkAdapter interface'ini implement et
   - Mevcut render fonksiyonlarını interface'e uyarla
   - Registry'e kaydet: ADAPTER_REGISTRY['playwright-ts']

3. Cypress adapter — src/codegen/adapters/cypress/:
   - index.ts: FrameworkAdapter implement et
   - locator.ts: Locator → cy.get() / cy.findByRole() / cy.findByLabel()
   - page-object.ts: Cypress Page Object (class değil, command veya
     helper object — Cypress conventions'a uy)
   - scenario.ts: describe + it blokları, cy.visit()
   - Bölüm 6.6.3'teki örnek çıktıyı birebir karşıla

4. SIDE PANEL — FrameworkPicker.tsx component:
   - "Playwright TS" | "Cypress" iki seçenekli tab/dropdown
   - Seçimi session'a kaydet
   - Generate butonuna tıklanınca seçili framework için üret

5. UNIT TESTS:
   - cypress/page-object.test.ts — snapshot test
   - cypress/scenario.test.ts — snapshot test
   - Aynı IR → farklı framework çıktısı (integration test)

6. Compile validation:
   - Üretilen Cypress kodu syntax açısından geçerli mi?
   - Node.js ile acorn parse et veya basit regex ile kontrol

pnpm test && pnpm build. LinkedIn post: "Cypress export geldi" teması.
Commit at. CLAUDE.md güncelle.
```

---

### HAFTA 7 — Self-Healing Locator

```
CLAUDE.md ve docs/technical-design.docx Bölüm 15'teki
"Self-Healing Locator" glossary entry, Bölüm 6.2 (IRElement fallbacks)
bölümlerini oku. Hafta 7: Self-Healing Locator Desteği.

YAPILACAKLAR:

1. Fallback locator'ların koda yazılması:
   - Playwright adapter güncelle: primary locator'ın altında
     yorumlu fallback'ler ekle:
     // Fallbacks: getByLabel('Email'), getByRole('textbox', {name: 'Email'})
   - Cypress adapter güncelle: aynı şekilde

2. Self-healing wrapper (opsiyonel, kullanıcı seçimli):
   - Playwright için selfHealingLocator() helper fonksiyonu üret:
     async function selfHealingLocator(page, locators) {
       for (const loc of locators) {
         try { return page.locator(loc); } catch { continue; }
       }
       throw new Error('All locators failed');
     }
   - Scaffold'a bu helper'ı dahil et (utils/locator.ts olarak)

3. IRElement güncelle — Bölüm 6.2:
   - elementSnapshot: seçili element'in o anki attribute'larının snapshot'ı
     (localName, textContent, className, id, testId, role)
   - Bu snapshot ilerleyen versiyonlarda AI destekli recovery için temel

4. SIDE PANEL — locator badge güncelle:
   - Primary locator'ın altında "2 fallback" badge'i
   - Badge'e tıklanınca fallback'leri listele

5. Export güncelle:
   - ZIP içindeki utils/locator.ts dosyası artık self-healing helper içeriyor
   - README.md'ye "Self-healing locators" feature olarak ekle

6. UNIT TESTS:
   - self-healing wrapper unit testi
   - IRElement snapshot capture testi

pnpm test && pnpm build. Commit at. CLAUDE.md güncelle.
```

---

### HAFTA 8 — Method Inference Güçlendirme + Network Capture

```
CLAUDE.md ve docs/technical-design.docx Bölüm 6.4 (method inference tam),
4.6 (network capture notu) bölümlerini oku.
Hafta 8: Method Inference v2 + Temel Network Capture.

YAPILACAKLAR:

1. Method inference güçlendir:
   - Daha geniş pattern tablosu (Hafta 2'de 5 pattern vardı, şimdi 10'a çıkar)
   - Parametre tipi çıkarımı: input type'a göre (email → string,
     number → number, checkbox → boolean)
   - Çakışan method isimlerini çöz (aynı sayfada 2 form varsa)
   - "Unknown pattern" için makul default isim stratejisi

2. Side panel — method inference preview:
   - Generate öncesinde: "Bu akıştan şu metodlar çıkarıldı: login(), search()"
   - Kullanıcı method ismini düzenleyebilsin

3. Network Request Capture (temel):
   - manifest.json: "declarativeNetRequest" permission ekle (önce bana sor)
   - background: fetch/XHR intercept (devtools protocol gerekiyorsa
     chrome.debugger API, CLAUDE.md'deki MV3 kısıtlamalarına dikkat et)
   - Yakalanan request'leri RecordedAction'a 'network' tipi olarak ekle
   - Network action'ları step listesinde farklı ikonla göster

4. Mock üretimi (temel):
   - 'network' action'ları olan step'ler için Playwright mock üret:
     await page.route('**/api/login', route => route.fulfill({ ... }))
   - Mock üretimi opsiyonel (Generate dialog'unda checkbox: "Include mocks")

5. UNIT TESTS:
   - method-inferer.test.ts güncelle — yeni pattern'ler
   - network action → mock output snapshot testi

pnpm test && pnpm build. Commit at. CLAUDE.md güncelle.
```

---

### HAFTA 9 — Visual Regression Entegrasyonu

```
CLAUDE.md oku. Hafta 9: Visual Regression Entegrasyonu.

YAPILACAKLAR:

1. Screenshot assertion tipi ekle:
   - AssertionSpec'e: { type: 'screenshot', name: string, threshold: number }
   - Kayıt sırasında kullanıcı "Take snapshot" diyebilir

2. Playwright çıktısı güncelle:
   - Screenshot assertion için: await expect(page).toHaveScreenshot('name.png')
   - Playwright'ın built-in visual regression'ı kullanılır (Applitools değil)

3. Cypress çıktısı güncelle:
   - cypress-image-snapshot plugin kullan (scaffold'da bağımlılık olarak)

4. Side panel — screenshot assertion ekle:
   - Assertion builder'a "Screenshot" seçeneği
   - Preview: küçük thumbnail göster

5. Scaffold güncelle:
   - ZIP export'ta screenshots/ klasörü
   - README.md'de visual regression kullanım talimatı

6. E2E test güncelle:
   - recording.spec.ts'e screenshot assertion senaryosu ekle

pnpm test && pnpm build. Commit at.
```

---

### HAFTA 10 — v0.5 Release

```
CLAUDE.md oku. Hafta 10: v0.5 Release.

YAPILACAKLAR:

1. Tüm Faz 2 özelliklerini final review:
   - Locator engine production kalitesi ✓
   - Cypress adapter ✓
   - Self-healing ✓
   - Method inference v2 ✓
   - Network capture ✓
   - Visual regression ✓
   Bu listeden eksik olan varsa önce onu tamamla.

2. Bug bash:
   - 5 farklı gerçek site'da extension'ı dene
   - Her sitede: kayıt başlat → 10 adım yap → generate → kodu derle
   - Bulunan bug'ları GitHub Issue'ya aç, kritik olanları düzelt

3. Performance check:
   benchmarks/performance.test.ts çalıştır, sonuçları README'ye ekle.

4. Package version: "0.5.0"

5. CHANGELOG.md güncelle — tüm Faz 2 özellikleri

6. README.md güncelle:
   - Cypress'i "✅ Stable" yap
   - Demo GIF varsa ekle (yoksa placeholder devam eder)
   - v0.5.0 release badge güncelle

7. Git tag + GitHub release (v0.5.0)

8. LinkedIn post — Bölüm 8.7.2'deki Hafta 10 teması:
   "Aynı kayıttan hem Playwright hem Cypress — IR mimarisi"
   Kısa taslağı docs/linkedin-w10-post.md olarak kaydet.

pnpm test && pnpm build. v0.5.0 tag at. CLAUDE.md güncelle.
```

---

## FAZ 3 — GENİŞLEME (Hafta 11–20)

> Faz 3 prompt'ları daha yüksek seviyede.
> Her adapter için teknik doküman Bölüm 6.6.4 ve 6.6.5'i referans alın.

---

### HAFTA 11-12 — Selenium Python Adapter

```
CLAUDE.md ve docs/technical-design.docx Bölüm 6.6.4 (Selenium Python
örnek çıktı), 6.7 (Adapter SDK) bölümlerini oku.
Hafta 11-12: Selenium Python (Pytest) Adapter.

YAPILACAKLAR:

1. src/codegen/adapters/selenium-py/ — tam implementasyon:
   - FrameworkAdapter interface implement et
   - locator.ts: Locator → By.CSS_SELECTOR / By.XPATH / By.ID patterns
   - page-object.ts: Python class, __init__, WebDriverWait, By locators
     (Bölüm 6.6.4'teki login_page.py çıktısını birebir karşıla)
   - scenario.ts: Pytest test fonksiyonları, fixture injection
   - scaffold.ts: requirements.txt (selenium, pytest, pytest-html),
     conftest.py (WebDriver setup/teardown), pytest.ini

2. Python syntax validation:
   - Üretilen Python kodunu Node.js subprocess ile python3 -c "import ast;
     ast.parse(open('file').read())" ile parse et
   - Hata varsa kullanıcıya göster

3. FrameworkPicker güncelle:
   - "Selenium Python" seçeneği ekle

4. UNIT TESTS:
   - selenium-py/page-object.test.ts — snapshot
   - python syntax validation testi

5. Manuel test: üretilen Python kodunu gerçekten çalıştırın
   (local Python + pip install selenium + chromedriver)

pnpm test && pnpm build. LinkedIn post: "Selenium Python eklendi."
Commit at. CLAUDE.md güncelle.
```

---

### HAFTA 13-14 — Selenium Java Adapter

```
CLAUDE.md ve docs/technical-design.docx Bölüm 6.6.5 (Selenium Java
örnek çıktı) bölümünü oku. Hafta 13-14: Selenium Java (TestNG) Adapter.

YAPILACAKLAR:

1. src/codegen/adapters/selenium-java/:
   - Java class üretimi: PageFactory, @FindBy annotations
     (Bölüm 6.6.5'teki LoginPage.java çıktısını referans al)
   - TestNG test sınıfı: @BeforeMethod, @Test, @AfterMethod
   - POM.xml scaffold: selenium-java, testng bağımlılıkları
   - testng.xml: suite config

2. FrameworkPicker güncelle: "Selenium Java" ekle

3. Java syntax — basit validation:
   - Açılmayan parantez, tırnak gibi temel hataları kontrol et
   - Full compile validation Faz 4'e ertelenebilir

4. UNIT TESTS: snapshot testler

pnpm test && pnpm build. LinkedIn post: "Java QA dünyası ihmal edilmişti."
Commit at. CLAUDE.md güncelle.
```

---

### HAFTA 15-18 — Chrome Web Store Hazırlığı

```
CLAUDE.md oku. Hafta 15-18: Chrome Web Store Hazırlığı ve Final Polish.

YAPILACAKLAR:

1. ICON SET — public/icons/:
   - icon16.png, icon32.png, icon48.png, icon128.png
   - Basit ama tanınabilir bir ikon (kayıt + kod teması)
   - Figma/Canva ile tasarla veya ücretsiz icon sitesinden al
   - Manifest.json'da action.default_icon ve icons bölümlerini doldur

2. STORE LISTING HAZIRLIĞI:
   - store-listing/ klasörü oluştur:
     * description.txt — 132 karakterlik kısa açıklama
     * detailed-description.txt — 16000 karakter limiti, feature listesi
     * screenshots/ — 1280x800 veya 640x400, en az 1 ekran görüntüsü
       (Hafta 4'teki demo-page.html ile çek)
     * promotional-image.png — 440x280 (opsiyonel ama önerilir)

3. PRIVACY POLICY:
   - docs/privacy-policy.md: "Bu extension hiçbir veriyi sunucuya
     göndermez. Tüm veriler yalnızca yerel tarayıcınızda saklanır."
   - Kısa ama net. Chrome Web Store bunu zorunlu kılar.

4. MANIFEST SON KONTROL:
   - Tüm permission'lar minimal mi? (Gereksiz permission eklenmediyse iyi)
   - description: 45 karakter
   - version: "1.0.0"

5. PRODUCTION BUILD OPTİMİZASYONU:
   - vite.config.ts: minify: true, terser options
   - Bundle analyzer: npx rollup-plugin-visualizer ile kontrol
   - 500KB hedefi aşıldıysa neyin büyük olduğunu bul

6. FINAL BUG BASH:
   - 10 farklı site'da test (React, Vue, Angular, plain HTML)
   - Her birinde tam flow: kayıt → generate → compile
   - Bulunan kritik bug'ları bu hafta içinde kapat

7. CHANGELOG.md güncelle — v1.0.0 bölümü ekle

8. README.md final:
   - GIF varsa ekle (varsa kesinlikle ekle, yoksa iyi bir screenshot)
   - Chrome Web Store badge placeholder

pnpm build → dist/ boyutunu söyle. Commit at. CLAUDE.md güncelle.
```

---

### HAFTA 19-20 — v1.0 Launch

```
CLAUDE.md oku. Hafta 19-20: v1.0 Final Launch.

YAPILACAKLAR:

1. Chrome Web Store başvurusu (Hafta 19):
   - developer.chrome.com/webstore → Developer Dashboard
   - New item → dist/ ZIP'ini yükle
   - Store listing bilgilerini doldur (store-listing/ klasöründen)
   - Privacy policy URL'ini ekle (GitHub Pages veya raw GitHub link)
   - Submit for review
   (İnceleme 1-7 gün sürebilir, bu süreçte diğer hazırlıklar yapılır)

2. v1.0.0 tag ve GitHub release (Hafta 19):
   - package.json + manifest.json: version "1.0.0"
   - git tag -a v1.0.0 ile tag at
   - GitHub release: kapsamlı release notes
   - dist/ ZIP'i asset olarak ekle

3. Documentation site hazırlığı — Faz 3 kapsamında:
   - docs/ klasörüne Docusaurus kurulumu (pnpm create docusaurus@latest)
   - Bölüm 14.2'deki site yapısını oluştur
   - En az şu sayfaları doldur:
     * intro.md, getting-started/installation.md,
       getting-started/first-recording.md
   - GitHub Pages deploy workflow'u ekle

4. LAUNCH İÇERİK PAKETİ:
   - LinkedIn post — docs/technical-design.docx Bölüm 14.3 taslağını
     kullan, v1.0'a güncelle: "5 ay önce başladım, bugün Chrome Web
     Store'da yayında"
   - dev.to yazısı taslağı: "How I built PlayForge — an open source
     codeless test builder" (mimari kararları + öğrendiklerinizi anlat)
   - Hacker News "Show HN" taslağı (kısa, demo linki ile)
   - Reddit r/QualityAssurance + r/webdev post taslakları
   Bunları docs/launch-content/ klasörüne kaydet.

5. good-first-issue etiketli 5 issue aç:
   - "Add WebdriverIO adapter"
   - "Add Firefox support"
   - "Localize UI to Spanish"
   - "Add keyboard shortcut to start/stop recording"
   - "Improve XPath strategy — add text() and @attribute shortcuts"

6. Tüm v1.0 release checklist'ini kontrol et
   (docs/technical-design.docx Bölüm 8.9 — her madde ✓ mü?)

Bitince özet ver: Chrome Web Store'da pending mi? Tag atıldı mı?
Docs site deploy oldu mu? Launch içerik hazır mı?
```

---

## TEKRARLAYAN GÖREVLER

Bu görevler her hafta veya her milestone sonunda yapılır.

---

### HAFTALIK KOD REVIEW

```
CLAUDE.md oku. Bu hafta yazılan kodu review ediyoruz.

src/ klasörünü tara, şunlara dikkat et:

1. CLAUDE.md'nin KAÇINILMASI bölümündeki kurallara uyum:
   - any tipi var mı?
   - console.log var mı (logger yerine)?
   - Hardcoded magic value var mı?
   - Floating promise var mı?

2. Naming convention uyumu (CLAUDE.md Bölüm 5):
   - Dosya isimleri doğru mu?
   - Boolean değişkenlerde is/has/should prefix'i var mı?

3. Dead code:
   - Import edilmiş ama kullanılmayan sembol var mı?
   - Export edilmiş ama hiç kullanılmayan fonksiyon var mı?

4. Test coverage boşlukları:
   - pnpm test --coverage çalıştır
   - %75 altında kalan modüller var mı?

Bulgular varsa kısa bir liste ver. Kritik olanları düzelt,
diğerleri için GitHub Issue aç (label: refactor).
pnpm lint && pnpm typecheck — sıfır hata.
```

---

### CLAUDE.md GÜNCELLEME

```
CLAUDE.md'nin "12. Mevcut Durum" bölümünü güncelle:

Şu anki Faz: [FAZ ADI]
Şu anki Hafta: [HAFTA NUMARASI]
Sonraki Görev: [GÖREV AÇIKLAMASI]

Tamamlananlar listesine şunları ekle:
[tamamlanan görevlerin listesi]

Başka bir şey değiştirme, sadece bu bölümü güncelle.
git add CLAUDE.md && git commit -m "chore: update CLAUDE.md current status"
```

---

### YENİ ADAPTER EKLEME (Topluluk İçin Şablon)

```
CLAUDE.md ve docs/technical-design.docx Bölüm 6.7 (Adapter SDK)
bölümünü oku. Yeni bir adapter ekliyoruz: [FRAMEWORK ADI].

YAPILACAKLAR:

1. src/codegen/adapters/[framework-id]/ klasörünü oluştur
2. FrameworkAdapter interface'ini implement et (Bölüm 6.7.1)
3. Şu metodları yaz:
   - renderLocator(locator: Locator): string
   - renderAction(step: IRStep, ctx: RenderContext): string
   - renderPageObject(page: IRPage): GeneratedFile
   - renderScenario(scenario: IRScenario): GeneratedFile
   - renderScaffold(plan: GenerationPlan): GeneratedFile[]
4. Registry'e kaydet: ADAPTER_REGISTRY['[framework-id]']
5. FrameworkPicker'a ekle
6. Snapshot testleri yaz
7. CONTRIBUTING.md'ye "Adapter ekleme" bölümünü güncelle

Framework hakkında bilgi: [framework dokümantasyon linki]
Beklenen çıktı örneği:
[örnek kod yapıştır]
```

---

_Son güncelleme: PlayForge PROMPTS.md v1.0_
_Teknik referans: docs/technical-design.docx_
