import { describe, it, expect } from 'vitest'
import prompts from 'prompts'
import { mergeJavaPageObject } from './java-page-object'

const EXISTING = `package pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

public class LoginPage {
    private final WebDriver driver;

    @FindBy(css = "[data-testid='email']")
    private WebElement emailInput;

    public LoginPage(WebDriver driver) {
        this.driver = driver;
    }

    public void login(String email, String password) {
        emailInput.sendKeys(email);
    }
}
`

const INCOMING = `package pages;

import java.time.Duration;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

public class LoginPage {
    private final WebDriver driver;

    @FindBy(css = "[data-testid='email']")
    private WebElement emailInput;

    @FindBy(css = "[data-testid='password']")
    private WebElement passwordInput;

    public LoginPage(WebDriver driver) {
        this.driver = driver;
    }

    public void login(String email, String password) {
        // SHOULD NOT REPLACE
    }

    public void resetPassword(String email) {
        emailInput.sendKeys(email);
    }
}
`

const NESTED = `package pages;
public class LoginPage {
    private int x;
    public static class Inner {
        public int y;
    }
}
`

describe('mergeJavaPageObject', () => {
  it('appends new fields + methods, leaves existing ones untouched', async () => {
    const result = await mergeJavaPageObject(EXISTING, INCOMING)

    expect(result.fallback).toBeNull()
    expect(result.added).toContain('passwordInput')
    expect(result.added).toContain('resetPassword')
    expect(result.skipped).toContain('login')
    expect(result.skipped).toContain('emailInput')

    // Existing `login` body is preserved (no "SHOULD NOT REPLACE" leak-in).
    expect(result.source).toContain('emailInput.sendKeys(email);')
    expect(result.source).not.toContain('SHOULD NOT REPLACE')

    // New members appear.
    expect(result.source).toMatch(/private WebElement passwordInput;/)
    expect(result.source).toMatch(/public void resetPassword\(String email\)/)
  })

  it('merges missing imports', async () => {
    const result = await mergeJavaPageObject(EXISTING, INCOMING)
    expect(result.source).toMatch(/^\s*import java\.time\.Duration;/m)
  })

  it('detects nested classes and returns existing source when user chooses skip', async () => {
    prompts.inject(['skip'])
    const result = await mergeJavaPageObject(NESTED, NESTED)
    expect(result.fallback).toBe('nested-class-skip')
    expect(result.source).toBe(NESTED)
  })

  it('detects nested classes and returns incoming source when user chooses overwrite', async () => {
    prompts.inject(['overwrite'])
    const result = await mergeJavaPageObject(NESTED, NESTED + '// new content\n')
    expect(result.fallback).toBe('nested-class-overwrite')
    expect(result.source).toContain('// new content')
  })
})
