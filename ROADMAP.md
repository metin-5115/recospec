# PlayForge — Yol Haritası

> Bu dosya Claude Code tarafından her oturumda referans alınır.
> Tasarım gerekçeleri için: `docs/technical-design.docx` Bölüm 8.

---

## Mevcut Durum

| Alan               | Değer                                              |
| ------------------ | -------------------------------------------------- |
| **Faz**            | Faz 1 — MVP (Hafta 1–4)                            |
| **Hafta**          | Hafta 1 / 4                                        |
| **Son tamamlanan** | Hafta 1, Görev 1 — GitHub repo oluşturuldu         |
| **Aktif görev**    | Hafta 1, Görev 2 — Vite + CRXJS extension iskeleti |
| **Sürüm**          | v0.0.x (henüz release yok)                         |

---

## Faz 1 — MVP (Hafta 1–4)

**Hedef:** Chrome eklentisi olarak click ve input olaylarını yakalayıp Playwright TypeScript kodu üretebilen MVP.

---

### Hafta 1 — Proje İskeleti ve Kayıt Altyapısı

- [x] GitHub repo oluştur (private başlat, Faz 1 sonunda public)
- [ ] Vite + CRXJS + React + TypeScript ile extension iskeleti kur
- [ ] `manifest.json` — Manifest V3, gerekli permission'lar
- [ ] Popup UI — "Start Recording" / "Stop Recording" butonları
- [ ] Content script — sayfaya inject, background ile iletişim
- [ ] Background service worker — temel mesaj yönlendirme
- [ ] ESLint + Prettier + Husky pre-commit hook
- [ ] README iskeleti

**Definition of Done**

- `npm run build` çalışıyor, `dist/` klasörü Chrome'a yüklenebiliyor
- Popup açılıyor, butona tıklandığında log yazılıyor
- Content script ↔ background ping-pong çalışıyor

---

### Hafta 2 — Event Capture ve Basit Locator

- [ ] Content script — capture phase `click` ve `input` event listener'ları
- [ ] `CapturedEvent` tip tanımı (`shared/` altında)
- [ ] LocatorEngine v0
  - [ ] `testid` stratejisi
  - [ ] `role+name` stratejisi
  - [ ] Basit CSS fallback
  - [ ] Implicit role lookup table — en sık 20 element
- [ ] Dexie.js setup — `sessions` ve `actions` tabloları
- [ ] Background — event'i `RecordedAction` olarak IndexedDB'ye yaz
- [ ] Side panel iskeleti (Chrome 114+)
- [ ] Side panel — kaydedilen adımları ham JSON olarak listele

**Definition of Done**

- 5–10 click + input sonrası side panel'de listeleniyor
- `data-testid`'li elementler için doğru locator üretiliyor
- Eklenti reload'da kayıtlar korunuyor (IndexedDB)

---

### Hafta 3 — Code Generation ve Playwright Çıktısı

- [ ] IR tip tanımları (bkz. `docs/technical-design.docx` Bölüm 6.2)
  - [ ] `IRStep`, `IRPage`, `IRSession` tipleri
- [ ] Normalizer — `RecordedAction` → `IRStep`
  - [ ] URL normalizer (sayısal ID ve UUID → parametre)
  - [ ] Page grouping (aynı normalize URL → tek `IRPage`)
  - [ ] Element naming (`aria-label` / text → camelCase + suffix)
- [ ] Playwright adapter — tek dosyalık çıktı
  - [ ] Tagged template literal helper'ları
- [ ] Side panel — "Generate Code" butonu + kod preview alanı
- [ ] Side panel — copy-to-clipboard butonu

**Definition of Done**

- 3 adımlı kayıttan geçerli Playwright kodu üretiliyor
- Üretilen kod gerçek bir Playwright projesinde çalışıp geçiyor

---

### Hafta 4 — UX Cilası, README, İlk Release

- [ ] Side panel UI Tailwind ile düzeltildi
- [ ] Adım silme ve yeniden sıralama (`dnd-kit`)
- [ ] Recording state göstergesi (kırmızı nokta vb.)
- [ ] Empty state ekranı
- [ ] README — problem, çözüm, install, usage GIF
- [ ] Logo / icon (16 / 48 / 128 px)
- [ ] `LICENSE` (MIT)
- [ ] `CONTRIBUTING.md` taslağı
- [ ] Repo'yu public yap, `v0.1.0` tag'i
- [ ] Demo GIF kaydı (30–60 saniye)
- [ ] LinkedIn ilk duyuru postu

**Definition of Done**

- Repo public, README'den eklenti kurulup denenebiliyor
- İlk LinkedIn postu yayınlandı
- `v0.1.0` GitHub release'i mevcut

---

## Faz 2 — Akıllılaşma (Hafta 5–10)

**Hedef:** Locator engine tamamlanıyor, POM üretimi, assertion UI, Cypress export. `v0.5` release.

| Hafta | Milestone                                         | Definition of Done                                                          |
| ----- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| 5     | Locator Engine — 9 stratejinin tamamı             | Tüm stratejiler implemente, %80+ test coverage                              |
| 6     | Kararlılık skorlaması + dinamik attribute tespiti | CSS-in-JS pattern'leri reddediliyor; benchmark suite geçiyor                |
| 7     | Page Object Model üretimi                         | Aynı sayfadaki action'lar tek class'a gruplandı; gerçek senaryoda çalışıyor |
| 8     | Method inference + parameterization UI            | Login pattern algılanıyor; UI'dan parametreleştirme; runnable kod           |
| 9     | Assertion builder UI + assert action tipi         | Visibility / text / attribute / count assertion; `expect` bloğu üretiliyor  |
| 10    | Cypress adapter + ZIP export + `v0.5` release     | Aynı kayıt iki framework'te export; `v0.5.0` yayınlandı                     |

> Detay: `docs/technical-design.docx` Bölüm 5.2, 5.3, 6.3, 6.4

---

## Faz 3 — Genişleme (Hafta 11–20)

**Hedef:** Selenium adapter'ları, self-healing, network mocking, visual regression, Chrome Web Store yayını. `v1.0` release.

- [x] **Hafta 11–12** — Selenium Python (Pytest) adapter'ı + project scaffold
- [x] **Hafta 13–14** — Selenium Java (TestNG) adapter'ı + project scaffold
- [ ] **Hafta 15** — Self-healing locator'lar (fallback zinciri koda ekleniyor)
- [ ] **Hafta 16** — Network request capture + opsiyonel mock üretimi
- [ ] **Hafta 17** — Visual regression entegrasyonu (açık kaynak araç)
- [ ] **Hafta 18** — Shadow DOM ve iframe piercing locator desteği
- [ ] **Hafta 19** — Chrome Web Store başvurusu
- [ ] **Hafta 20** — `v1.0` release — CWS onayı, dokümantasyon sitesi, launch postları

> Detay: `docs/technical-design.docx` Bölüm 6.6, 6.7, 5.5

---

## Faz 4 — Topluluk (Hafta 21+)

**Hedef:** Dış katkı kabulü, ekosistem genişletme, topluluk büyütme.

- [ ] `playforge-cli` — CI ortamında kod üretimi
- [ ] VS Code extension entegrasyonu
- [ ] Plugin SDK rehberi (topluluk adapter'ları)
- [ ] Docusaurus ile dokümantasyon sitesi
- [ ] İlk `good-first-issue` PR'ları
- [ ] Discord topluluğu (#announcements, #help, #adapter-dev, #feedback)
- [ ] Konferans / meetup başvuruları

> Detay: `docs/technical-design.docx` Bölüm 8.5, 8.8

---

## v1.0 Release Checklist

> Tüm maddeler yeşil olmadan `v1.0.0` tag'i atılmaz.

### Ürün

- [ ] 4 framework adapter'ı tam çalışır (Playwright TS, Cypress JS, Selenium Python, Selenium Java)
- [ ] Locator engine 9 stratejisi production'da kararlı
- [ ] Page Object Model üretimi gerçek 5 site üzerinde test edildi
- [ ] Self-healing locator desteği aktif
- [ ] Visual regression entegrasyonu hazır
- [ ] Shadow DOM ve iframe destekli

### Kalite

- [ ] Unit test coverage %75+ genel, locator-engine ve codegen %85+
- [ ] E2E test suite — 10+ senaryo
- [ ] CI yeşil, son 20 commit'te 0 failure
- [ ] Bundle size `<500KB` total

### Doküman

- [ ] README — problem, demo GIF, install, usage, framework support tablosu
- [ ] Docusaurus dokümantasyon sitesi yayında
- [ ] Framework karşılaştırma sayfası
- [ ] Adapter geliştirme rehberi
- [ ] Privacy policy

### Topluluk

- [ ] `CONTRIBUTING.md` eksiksiz
- [ ] `CODE_OF_CONDUCT.md` mevcut (Contributor Covenant v2.1)
- [ ] İlk 5 `good-first-issue` açıldı
- [ ] Discord sunucusu kuruldu
- [ ] Issue ve PR şablonları aktif (`bug_report.yml`, `feature_request.yml`, `adapter_request.yml`)

### Yayın

- [ ] Chrome Web Store başvurusu onaylandı
- [ ] `v1.0.0` GitHub release'i oluşturuldu
- [ ] LinkedIn launch postu hazır
- [ ] dev.to / Medium uzun yazı taslağı hazır
- [ ] Hacker News "Show HN" postu hazır
- [ ] Reddit launch postu hazır

---

## GitHub Milestone Haritası

| GitHub Milestone | Faz                         | Hedef Hafta |
| ---------------- | --------------------------- | ----------- |
| `v0.1.0`         | Faz 1 sonu                  | Hafta 4     |
| `v0.5.0`         | Faz 2 sonu                  | Hafta 10    |
| `v1.0.0`         | Faz 3 sonu — Public Release | Hafta 20    |
| `v1.x`           | Faz 4 — Community Growth    | Hafta 21+   |

---

## Başarı KPI'ları (Referans)

| Metrik                     | Faz 1 sonu | Faz 2 sonu | v1.0 | 12 ay |
| -------------------------- | ---------- | ---------- | ---- | ----- |
| GitHub Stars               | 10–30      | 100        | 500  | 1500+ |
| Chrome Web Store kullanıcı | —          | —          | 100  | 1000+ |
| Dış katkıcı PR             | 0          | 2–3        | 10+  | 30+   |

> Detay: `docs/technical-design.docx` Bölüm 8.10
