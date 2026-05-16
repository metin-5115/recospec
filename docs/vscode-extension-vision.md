# PlayForge VS Code Extension — Vizyon ve Kuzey Yıldızı

> **Bu doküman ne işe yarar?** Faz 7'de PlayForge'a eklediğimiz VS Code
> extension'ın **neden** var olduğunu, **kim için** olduğunu ve **hangi son
> deneyimi** hedeflediğini anlatır. Yeni bir Claude Code oturumu açıp Sprint
> 1–8 prompt'larından birini verdiğinde **önce bu dosyayı oku** — kodu
> doğru yere koymak için büyük resmi bilmek gerek.
>
> **Çalıştığın sprint için detay**:
> [C:\Users\Metin\.claude\plans\bu-projeyi-vscode-extension-cached-mountain.md](../../Users/Metin/.claude/plans/bu-projeyi-vscode-extension-cached-mountain.md)
> (plan dosyası — sprint prompt'ları ve teknik detaylar burada).

---

## 1. PlayForge bugün ne yapıyor?

PlayForge bir **Chrome extension** + bir **Node CLI**. İş akışı:

1. Kullanıcı Chrome'da kayda başlar.
2. Sayfada gezinir, butonlara tıklar, formları doldurur.
3. Locator engine her etkileşim için 9 stratejiden en kararlı seçeneği seçer
   (testid → aria-label → role+name → label → text → id → css → xpath).
4. Stop sonrası kayıt IndexedDB'de oturur; kullanıcı:
   - **ZIP indir**: hazır Playwright/Cypress/Selenium-Py/Selenium-Java projesi
   - **JSON for CLI indir**: `playforge add <json>` ile mevcut bir test
     projesine merge eder

Hedef: **manuel düzenleme gerektirmeden çalışan test kodu** üretmek. Self-
healing fallback'ler, sensitive value redaction, page object inference,
network mocks — hepsi otomatik.

**v0.6.0** itibariyle 4 framework adapter + CLI (`add`, `init`, `--bdd`) +
session versioning + diff explorer + BDD output + test data parameterization
hepsi shipping.

---

## 2. Şimdi neden VS Code extension'a ihtiyacımız var?

Bugünkü deneyim **iki ayrı uygulama arasında manuel adımlar gerektiriyor**:

```
Chrome'da kayıt → JSON indir → terminale geç → playforge add çalıştır →
                                              → IDE'ye dön, dosyaları gör
```

Geliştirici akışını üç defa kırıyor. Üstüne Claude Code popüler hale
gelince **daha güzel bir akış mümkün** olduğunu fark ettik:

```
VS Code'da "PlayForge: Record" tıkla
  ↓
Chromium otomatik açılır (PlayForge ext pre-loaded, kullanıcı kurmuyor)
  ↓
Flow'u kaydet → Stop
  ↓
VS Code'a otomatik dön → Output Picker webview açılır
  ↓
[x] Test code  [x] Claude prompt  [ ] BDD  [ ] Mocks → Apply
  ↓
Projeye dosyalar yazılır + Claude Code prompt'u .claude/commands/'a
düşer → /playforge-<flow> slash komutu hazır
```

Tek tıkla **record → ship**. Playwright Codegen'in "PlayForge versiyonu"
ama locator engine + Page Object inference + Claude entegrasyonu dahil.

---

## 3. Hedef kullanıcı

- Manuel test yazmaktan sıkılan **QA + dev** karışımı bir profil.
- VS Code + Claude Code zaten kullanan.
- Mevcut bir test projesi var (Playwright/Cypress/Selenium); sıfırdan
  iskelet kurmak istemiyor — flow'unu kaydedip projesine **merge** etsin.
- Recording'in test koduna nasıl döndüğünün **şeffaf** olmasını istiyor:
  hangi locator seçildi, hangi fallback'ler ranked, hangi method inference
  pattern'i tetiklendi. Black-box değil.

---

## 4. Vizyon — "Record in VS Code, ship in 30 seconds"

Son ürün VS Code Marketplace'te (v1.0'da) yer alacak. Demo GIF'i:

1. VS Code aç, bir Playwright projesi
2. Activity bar'da PlayForge ikonu görünür
3. `Cmd+Shift+P` → "PlayForge: Record"
4. Chromium açılır — `https://app.example.com/login` git
5. Email + password gir, Login tıkla
6. Stop
7. Output picker açılır, checkbox'lar pre-selected
8. Apply
9. `pages/LoginPage.ts` + `tests/scenario.spec.ts` +
   `.claude/commands/playforge-login.md` dosyaları workspace'te belirir
10. `LoginPage.ts`'de locator'lar dolu, password yerine
    `process.env.PLAYFORGE_PASSWORD ?? 'change-me'`
11. Claude Code `/playforge-login` slash komutu görür — invoke edince
    test code'u yazıp/günceller

**30 saniye**. Manuel adım yok. Yazma yok.

---

## 5. Mimari ilkeler (sprint'lerde unutma)

1. **Companion model** — Chrome extension yaşıyor, VS Code extension
   onu **orkestre eder**. Kayıt yine Chrome ext'in işi; VS Code Chromium'u
   başlatır, JSON'u alır, projeye yazar.

2. **Pure IR core reuse** — Yeni iş kodu yok. Mevcut `src/codegen/`
   (`normalizeActions`, `groupIntoPages`, adapter'lar) hem Chrome ext, hem
   CLI, hem VS Code extension'da çalışır çünkü pure logic (Chrome API yok,
   FS yok). VS Code extension yeni IR yazmıyor — sadece consume ediyor.

3. **Bundled extension** — Kullanıcı PlayForge Chrome ext'i ayrıca
   yüklemiyor. VS Code extension Chrome dist'ini paketinde taşır;
   Playwright launch ederken `--load-extension=` flag'i ile injekt edilir.

4. **Pure module yapısı bozulmaz** — Browser-only kod (`chrome.*`, DOM
   API'ler) `src/codegen/` altına SIZDIRILMAZ. VS Code extension Node-only;
   import edebileceği şeyler `src/codegen/`, `src/cli/` (Node parts),
   `src/shared/types/`.

5. **No new runtime deps** — Playwright zaten devDep, `@types/vscode` ve
   `@vscode/vsce` sadece build-time. Yeni runtime npm paketi eklenmiyor.
   (Bundle Chromium ile birlikte gelir, 150MB; one-time install cost.)

6. **Privacy-first** — CLAUDE.md ilkesi: telemetry, analytics yok. Output
   picker, recording bridge — hepsi local. WebSocket bridge fallback'i bile
   localhost'ta tek bağlantı.

7. **ConflictReporter pattern** — CLI `prompts` lib'i (TTY interactive) VS
   Code'da çalışmaz. Sprint 3'te `runAdd`'i `ConflictReporter` interface'i
   ile decouple ediyoruz; hem CLI hem VS Code aynı `runAdd`'i kullanır,
   her biri kendi reporter'ını verir.

8. **Output Picker kullanıcı kontrolü** — Her seferinde checkbox'larla
   user seçer (test code, Claude prompt, BDD, mocks, redaction). Hardcoded
   default'lar yok; framework auto-detect pre-fill için kullanılır ama
   user override edebilir.

---

## 6. Claude Code Prompt entegrasyonu — neden önemli?

VS Code extension'ın **headline feature**'ı sadece test code yazmak
değil; aynı zamanda **Claude Code için bir prompt dosyası** üretmek.

Üretilen `.claude/commands/playforge-<flow>.md` dosyası:

- YAML frontmatter (description, argument-hint, allowed-tools)
- Flow'un doğal dil özeti (inferred methods kullanarak: "Login flow with
  email + password, then expects /dashboard URL")
- **Locator catalogue olarak fenced JSON code block** — Claude'un
  hallucinate edemeyeceği ground truth
- Fallback chain'ler, fragility hints, mock guidance, assertion
  expectations
- Sensitive value contract (literal değer YOK, env-var placeholder)

Claude Code bu dosyayı `/playforge-<flow>` slash komutu olarak görür.
Kullanıcı invoke edince Claude:

- Test code'u yazar (eğer hiç yoksa)
- UI değişiminden sonra kırılan locator'ı fallback'le değiştirir
- Yeni assertion ekler — locator catalogue'dan ground truth alır

**Tek bir dosya** — hem dokümantasyon hem self-healing kaynağı hem AI
context.

---

## 7. Sprint yapısı (yüksek seviye)

8 sprint, ~18 takvim günü, tek release: v0.7.0.

| #   | Sprint                                       | Süre  | Output                                                                |
| --- | -------------------------------------------- | ----- | --------------------------------------------------------------------- |
| 1   | Prompt export modülü (pure)                  | 3 gün | `src/codegen/export/prompt-export.ts`                                 |
| 2   | CLI `playforge prompt` komutu                | 1 gün | `src/cli/commands/prompt.ts`                                          |
| 3   | `ConflictReporter` refactor                  | 2 gün | `src/codegen/apply/conflict-reporter.ts` + `runAdd` imza güncellemesi |
| 4   | VS Code extension iskeleti + statik komutlar | 3 gün | İlk `.vsix` (Record yok ama Apply Existing JSON var)                  |
| 5   | Output Picker webview                        | 2 gün | Checkbox'lı framework + output type seçici                            |
| 6   | Browser controller + Record komutu (asıl iş) | 4 gün | Playwright launch + auto JSON export → projeye yazma                  |
| 7   | Tree view (recordings explorer)              | 1 gün | Activity bar sidebar, context menu                                    |
| 8   | Docs + packaging + release v0.7.0            | 2 gün | Marketplace-ready VSIX, CHANGELOG, README, LinkedIn post              |

**Sprint sırası bağlayıcıdır**:

- Sprint 4 → Sprint 3'e yaslı (ConflictReporter olmadan VS Code reporter
  yazılamaz)
- Sprint 5 → Sprint 4'e yaslı (skeleton olmadan webview iliştirilemez)
- Sprint 6 → Sprint 5'e yaslı (Record sonu picker'ı çağırır)
- Sprint 8 son adım: tüm version bump'lar burada, tek tag v0.7.0

Her sprint:

1. Önce CLAUDE.md + plan dosyası + bu vision dokümanı okunur
2. Plan dosyasındaki sprint brief uygulanır
3. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` yeşil olmalı
4. Conventional commit (mesaj plan dosyasında yazılı)
5. Sonraki sprint için yeni Claude Code oturumu

---

## 8. NE YAPMIYORUZ (scope dışı)

- ❌ Bağımsız VS Code extension package — Chrome ext'le **birlikte**
  yaşar, ayrılmaz.
- ❌ Hover provider, code lens, inline diagnostics, quick fix — Faz 8+
- ❌ Auto-watch JSON folder daemon — VS Code "Record" tek tetik
- ❌ MCP server — statik prompt dosyası seçildi
- ❌ `.claude/agents/*.md` sub-agent generator — yanlış granularity
- ❌ Marketplace publish v0.7.0'da — VSIX yeterli, publisher account
  sonra
- ❌ Bidirectional sync (edited prompt → IR) — out of scope
- ❌ Telemetry — kesin yok
- ❌ Hover-style locator preview — Faz 8+

---

## 9. Başarı kriteri

v0.7.0 ship olduğunda:

1. `pnpm package:vscode` → `playforge-vscode-0.7.0.vsix` üretiliyor
2. VS Code'a VSIX yüklenebiliyor, activity bar'da PlayForge ikonu var
3. Boş bir Playwright projesinde "PlayForge: Record" → Chromium açılır →
   demo flow kaydedilir → projeye 3 dosya yazılır (page object, spec,
   Claude prompt) — manuel müdahalesiz
4. Üretilen test `npx playwright test` ile geçer
5. Üretilen Claude prompt dosyası `/playforge-<flow>` slash komutu
   olarak Claude Code'da görünür ve invoke edildiğinde Claude test code'a
   doğru locator'larla giriş yapar
6. `pnpm test` 644+ test passing
7. CHANGELOG, README, CLAUDE.md güncel; LinkedIn post hazır

---

## 10. Hızlı referans

| Konu                                              | Dosya                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Sprint detayları + kopyala-yapıştır prompt'lar    | `C:\Users\Metin\.claude\plans\bu-projeyi-vscode-extension-cached-mountain.md`        |
| Proje genel kuralları, tech stack, konvansiyonlar | `CLAUDE.md`                                                                          |
| IR tipleri                                        | `src/codegen/ir/types.ts`                                                            |
| Mevcut JSON export şekli                          | `src/codegen/export/json-export.ts`                                                  |
| Reuse edilecek IR pipeline                        | `src/codegen/normalizer/action-normalizer.ts`, `src/codegen/planner/page-grouper.ts` |
| Sensitive value redaction reuse                   | `src/codegen/planner/sensitive-detector.ts`                                          |
| CLI pattern referansı                             | `src/cli/index.ts`, `src/cli/commands/add.ts`                                        |
| ZIP/markdown template pattern                     | `src/codegen/export/zip-export.ts` (line 5–79)                                       |
| Mevcut framework adapter'ları                     | `src/codegen/adapters/{playwright-ts,cypress,selenium-py,selenium-java}/`            |

---

**Özet**: PlayForge'u "kaydedip indir, sonra terminal aç, sonra IDE'ye dön"
zincirinden kurtarıp **VS Code'un içinde tek tıkla record → ship** akışına
taşıyoruz. Mevcut IR pipeline'ını yeniden kullanıyoruz, Claude Code prompt
dosyası ile self-healing AI workflow'unu da ücretsiz kazanıyoruz.
