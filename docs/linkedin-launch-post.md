# LinkedIn Launch Post — PlayForge v0.1.0

**Tarih:** 6 Mayıs 2026

---

🚀 **Bugün ilk açık kaynak projemi yayınladım: PlayForge v0.1.0**

[screenshot eklenecek]

Test otomasyonu yazmak zahmetli. Bir form dolusu locator, sayfalarca Page Object
boilerplate, framework dokümantasyonu... Bunların hepsini sıfırdan yazmak yerine,
tarayıcıda olduğu gibi kaydet — kodu otomatik al.

**PlayForge bunu yapıyor.**

Chrome eklentisi olarak çalışıyor. Start'a basıyorsun, siteyi kullanıyorsun,
Stop'a basıyorsun. Karşında production-ready Playwright TypeScript kodu oluyor.
Page Object Model'iyle, locator'larıyla, test senaryosuyla birlikte.

---

**Neden farklı?**

Playwright Codegen, Selenium IDE gibi araçlar var — hepsini denedim. Hepsinin
ortak sorunu: ürettikleri kod çoğu zaman doğrudan kullanılamıyor. `css-1a2b3c`
gibi dinamik class'lar, düz `document.querySelector` çıktıları, tek dosyaya
gömülmüş test kodu...

PlayForge'da:

- **9 locator stratejisi** öncelik sırasıyla denenip en stabil olanı seçiliyor
  (`data-testid` → `aria-label` → `role+name` → `label` → `text` → `id` → CSS → XPath)
- **Stability scoring** ile dinamik class'lar ve geçici id'ler otomatik reddediliyor
- **Page Object Model** doğrudan üretiliyor — düz script değil, class-based yapı
- **Shadow DOM ve iframe** destekleniyor (açık shadow root'lar pierce ediliyor)
- **Assertion builder** ile `expect(locator).toBeVisible()` adımları kayda eklenebiliyor
- **Session yönetimi** — pause/resume, geçmiş kayıtlar, JSON + ZIP export

---

**Teknik stack:**

Chrome Manifest V3 · React 18 + TypeScript · Vite + CRXJS · Tailwind · Zustand ·
IndexedDB (Dexie) · Playwright · Vitest

---

**Kaynak kod:**
→ https://github.com/metin-5115/playforge

MIT lisanslı. PR'lar ve issue'lar açık.

Eğer test otomasyonu yazıyorsan, bir dene. Geri bildirim almak isterim.

---

#TestAutomation #Playwright #ChromeExtension #OpenSource #QA #WebDevelopment
#TypeScript #PageObjectModel #SoftwareTesting

---

_Not: [screenshot eklenecek] satırına GIF veya ekran görüntüsü eklenecek._
