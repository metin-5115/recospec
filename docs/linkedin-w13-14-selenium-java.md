# Java QA dünyası ihmal edilmişti.

Bugün PlayForge'a Selenium Java (TestNG) adapter'ını ekledim — ve açıkça söyleyeyim: codeless test araçları neredeyse her zaman önce JS/TS, belki Python çıkarır. Java QA ekosistemi öksüz kalır.

Halbuki banka, sigorta, telco, kamu — büyük kurumların QA otomasyon stack'lerinin çoğu hâlâ **Selenium + Java + TestNG + Maven** üzerinde duruyor. Onlara "tarayıcıda tıkla, Java testi al" diyebilen bir araç yok denecek kadar az.

PlayForge artık üretiyor. Aynı kayıttan üç dakikada:

```java
package pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
// …

public class LoginPage {
    private final WebDriver driver;
    private final WebDriverWait wait;

    @FindBy(css = "[data-testid=\"login-email\"]")
    private WebElement emailInput;

    @FindBy(xpath = "//button[normalize-space()='Sign In']")
    private WebElement signInButton;

    public LoginPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        PageFactory.initElements(driver, this);
    }

    public void login(String email, String password) {
        wait.until(ExpectedConditions.visibilityOf(emailInput));
        emailInput.clear();
        emailInput.sendKeys(email);
        // …
        wait.until(ExpectedConditions.elementToBeClickable(signInButton)).click();
    }
}
```

Yanına TestNG iskeleti, `pom.xml` (selenium-java + testng + webdrivermanager), `testng.xml` suite config — `mvn test` ile direkt çalışıyor.

## Neden bu kadar geciktirildi?

Üç sebep:

**1. Hedef kitle yanılgısı.** Codeless araçlar genelde "front-end developer" ya da "manuel QA" personası için tasarlanır. Kurumsal QA ekipleri "fazla teknik" gibi görünür ve es geçilir. Halbuki onlar **en çok ihtiyaç duyan** taraf — onların ekipleri zaten Java, manuel test yazma süresi ölçeklenmiyor.

**2. Java string templating "korkutucu".** Selenium Java çıktısı için sadece string birleştirme yetmez: `package` declaration, import order, reserved word escape (bir element adı `class` ise field name `_class` olmalı), camelCase / PascalCase / UPPER_SNAKE arası geçiş… Bunlar JS/Python'a göre bir kademe daha titiz.

**3. Validation pahalı.** Python AST parser'ı `import ast; ast.parse(...)` ile bedavaya geliyor. Java için `javac` gerekir, bu da her contributor'da JDK demek. Geçici çözüm: lightweight bracket/string/comment walker (`java-validate.ts`) — unbalanced braces, unterminated string literal, mismatched bracket type yakalıyor. Full compile validation Faz 4'e ertelendi.

## Nelere dikkat ettim?

- **`@FindBy` annotation'ı doğru türde** — testid → `css = "..."`, role-name → `xpath = "//button[normalize-space()='X']"`, id → `id = "..."`. Mixed-quote XPath değerleri için `concat()` literal'i.
- **PageFactory disiplini** — constructor sonunda `PageFactory.initElements(driver, this)`. Tüm WebElement field'ları `private`. Field adları camelCase, sınıf adları PascalCase, dosya adı sınıf adıyla aynı.
- **TestNG lifecycle** — `@BeforeMethod` / `@Test` / `@AfterMethod`, `driver.quit()` her test sonunda. Headed mode için `-Dheaded=true` system property — CLI tarafında ekstra config yok.
- **Self-healing fallbacks** — her field'ın altında `// Fallbacks: @FindBy(css = "..."), @FindBy(xpath = "...")` yorumu. Primary selector kırıldığında dakikalar içinde swap.
- **Reserved-word safety** — bir element adı `class` veya `1stItem` gibi geçersiz Java identifier'ı çıkarsa `_` prefix ile escape ediyorum.

## Sayılar

- **65 yeni test** (locator unit + page-object snapshot + scenario snapshot + structural validation)
- Toplam suite **351/351 passing**, ~10 saniye
- `pnpm build` clean — Java adapter pure JS string templating, bundle size'a etki yok
- Section 6.6.5'teki referans çıktı satır satır eşleşiyor

## v1.0 release checklist

| Adapter           | Durum                  |
| ----------------- | ---------------------- |
| Playwright TS     | ✅ Stable              |
| Cypress JS        | ✅ Stable              |
| Selenium Python   | ✅ Stable (W11–12)     |
| **Selenium Java** | **✅ Stable (W13–14)** |

Dört adapter de hazır. Faz 3 — Genişleme'nin yarısını bitirdik. Bir sonraki büyük taş Shadow DOM piercing & Chrome Web Store yayını.

## Çıkarımlar

Eğer kurumsal QA için araç tasarlıyorsanız: **Java'yı es geçmeyin**. Hedef kitle daha küçük gibi görünüyor ama daha az alternatifi var ve uzun vadede daha sadık. PlayForge'da öncelik sırasını "kullanıcı sayısı" değil "alternatif yokluğu" üzerine kurdum — Java QA bunun en net örneği.

Bir şey daha: codeless araç değer yaratmak için **production-ready** kod üretmek zorunda. "Skeleton oluşturup geri kalanı sen yaz" yetmez. Üretilen Java kodu manuel düzenleme gerektirmeden `mvn test` ile çalışmalı. Bu ölçütü tutturmak için her adapter ayrı ayrı emek istiyor — ortak IR pipeline tek başına yetmiyor. Doğru framework idiom'unu bilen biri (PageFactory, `@FindBy`, `WebDriverWait`, TestNG annotations) çıktıyı incelemeli.

Tüm kod açık kaynak. Repo'da `src/codegen/adapters/selenium-java/`. PR'lar açık.

#OpenSource #QA #TestAutomation #Selenium #Java #TestNG #PlayForge #ChromeExtension
