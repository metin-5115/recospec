# LinkedIn Post — Hafta 10: PlayForge v0.5 Release

**Tema:** Aynı kayıttan hem Playwright hem Cypress — IR mimarisi (`docs/technical-design.docx` Bölüm 8.7.2).
**Tarih:** 8 Mayıs 2026

---

🎉 **PlayForge v0.5 yayında.** Faz 2 — "Akıllılaşma" tamam.

[GIF eklenecek: aynı kayıttan Playwright TS ve Cypress JS export]

Hatırlatma: PlayForge, Chrome'da web sayfasını kullanırken yaptığın etkileşimleri
kaydedip **production-ready test kodu** üreten açık kaynak eklenti.

v0.1'de tek framework (Playwright TS) çıktısı vardı. v0.5'de ana sorunu çözdük:

▶️ **Aynı kayıt, iki framework.** Bir kez recording yapıyorsun, side panel'den
Playwright TS ya da Cypress JS arasında geçiş yapıyorsun. Locator'lar, Page
Object'ler, test senaryosu, ZIP scaffold — hepsi her iki framework için ayrı ayrı.

Bu nasıl mümkün oldu? **IR (Intermediate Representation)** mimarisi.

Pipeline üç aşamalı:

1. **Normalizer** — `RecordedAction` → `IRStep`. URL'lerdeki sayısal ID ve UUID'ler
   parametreleştiriliyor, aynı sayfadaki action'lar `IRPage` altında gruplanıyor.
2. **Planner** — `IRPage` üzerinde method inference (10 pattern: login, search,
   submitForm, navigateFromMenu, …) ve parametre tipi çıkarımı (`number`, `boolean`).
3. **Adapter** — IR'dan framework çıktısı. Playwright TS adapter ve Cypress JS
   adapter `FrameworkAdapter` interface'ini implemente ediyor.

Adapter SDK ortaya çıktı: `registerAdapter(...)` ile yeni framework eklemek artık
~300 satır iş — Selenium Python ve Java zaten Faz 3'te bu yolla gelecek.

---

**v0.5 ile gelen büyük özellikler:**

🩹 **Self-healing locators** — her element için sıralı fallback'ler. Üretilen
projede `selfHealingLocator` (Playwright) ya da `cy.selfHealing` (Cypress) helper'ı
runtime'da zinciri yürüyor; primary locator kırılırsa fallback'e geçiyor.

🔌 **Method inference v2** — 10 pattern, parametre tipi çıkarımı, side panel'den
inline rename. `clickButton1` yerine `submitOrder` yazıyorsun, codegen pipeline
`applyRenames` ile uyguluyor.

🌐 **Network capture & mock** — MAIN-world content script `fetch` ve `XMLHttpRequest`'i
sarmalıyor (yeni izin yok). Opt-in checkbox ile Playwright `page.route(...)` mock'ları
otomatik üretiliyor — backend yokken bile test koşturabilirsin.

📸 **Visual regression** — element üzerinde "Screenshot match" suggestion'ı, otomatik
thumbnail capture, ayarlanabilir threshold. Playwright `toHaveScreenshot()` ya da
Cypress `cypress-image-snapshot` üzerinden çıktı.

---

**Sayılar:**

- 248 unit test geçiyor (Faz 1'de 95 idi)
- Locator engine p99: **1.33 ms** (single eval, küçük DOM)
- 1000-elementli DOM'da single eval: max **130 ms** (bütçe 500 ms)
- Bundle size: **~478 KB** uncompressed (limit 500 KB)
- 2 framework adapter, 9 locator stratejisi, 10 method inference pattern'i

---

🔜 **Sıradaki — Faz 3:** Selenium Python (Pytest) adapter, sonra Selenium Java
(TestNG), sonra Chrome Web Store.

Açık kaynak: github.com/metin-5115/playforge
MIT lisans. Telemetry yok. Issue ve PR açık.

#testautomation #playwright #cypress #opensource #chromeextension #typescript #qa
