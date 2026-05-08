# LinkedIn Post — Hafta 6: Cypress Export

**Tema:** Cypress export geldi.

---

🔧 PlayForge — Hafta 6 tamam: **Cypress export** geldi.

Hatırlatma: PlayForge, web sayfasındaki tıklama ve input'ları kaydedip
**production-ready test kodu** üreten açık kaynak Chrome eklentisi.

Bu hafta neler değişti:

▶️ **Adapter SDK** — `FrameworkAdapter` interface + `ADAPTER_REGISTRY`.
Tek IR (Intermediate Representation) → birden çok framework çıktısı.
Yeni adapter eklemek için artık `registerAdapter(...)` yeterli.

▶️ **Cypress JS adapter** — locator, page object, scenario ve scaffold modülleri.
Output: `describe / it` blokları, `cy.visit`, `cy.get`, `cy.findByRole`,
`cy.findByLabelText`, plus `@testing-library/cypress` desteği.

▶️ **Side panel'de framework seçici** — Playwright TS / Cypress arası tek tıkla
geçiş, seçim `localStorage`'da kalıcı. Aynı kayıttan aynı anda iki ayrı
framework için kod export edebiliyorsun.

▶️ **Compile validation** — üretilen Cypress kodunu `new Function()` ile parse
ederek syntax doğruluğunu test ediyoruz. CI'da yeşil.

📊 Sayılar:

- 28 test dosyası, **203 test** geçiyor
- Cypress adapter için **25 yeni unit test** + multi-framework integration testi
- Bundle size hâlâ **<410 KB** (manifest V3 limiti rahat)

🔜 Sıradaki: Selenium Python (Pytest) adapter — Hafta 7.

Tüm kod açık kaynak: github.com/metin-5115/playforge
(MIT lisans + privacy-first; telemetry yok.)

#testautomation #playwright #cypress #opensource #chromeextension #typescript
