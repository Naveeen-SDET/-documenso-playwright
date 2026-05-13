import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * LoginPage
 *
 * Covers: /signin
 *
 * Locator priority:
 *   1. data-testid  → getByTestId()
 *   2. ARIA role    → getByRole()
 *   3. Visible label / text → getByLabel() / getByText()
 */
export class LoginPage extends BasePage {
  // ── Locators ────────────────────────────────────────────────────────────────

  /** Email input — falls back to label if testid not present */
  readonly emailInput: Locator;

  /** Password input */
  readonly passwordInput: Locator;

  /** Primary sign-in submit button */
  readonly signInButton: Locator;

  /** Inline error message shown on bad credentials */
  readonly errorMessage: Locator;

  /** "Forgot password?" link */
  readonly forgotPasswordLink: Locator;

  // ── Constructor ─────────────────────────────────────────────────────────────

  constructor(page: Page) {
    super(page);

    // Use attribute-based locators — stable across Documenso versions
    this.emailInput    = page.locator('input[type="email"], input[name="email"], input[id="email"]').first();
    this.passwordInput = page.locator('input[type="password"]').first();
    this.signInButton  = page.getByRole('button', { name: /sign in/i });
    this.errorMessage  = page.getByRole('alert');

    this.forgotPasswordLink = page.getByRole('link', { name: /forgot/i });
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  async navigate(): Promise<void> {
    await this.goto('/signin');
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  /**
   * Fill credentials and submit the login form.
   * Does NOT assert outcome — callers decide what to expect.
   */
  async login(email: string, password: string): Promise<void> {
    await this.navigate();
    await this.emailInput.waitFor({ state: 'visible' });
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
    await this.page.waitForURL(url => !url.toString().includes('/signin'), { timeout: 15000 });
  }

  /**
   * Full happy-path: fill → submit → wait for redirect away from /signin.
   */
  async loginAndWaitForDashboard(email: string, password: string): Promise<void> {
    await this.login(email, password);
    await this.waitForUrl(/\/documents/);
  }

  // ── Accessor helpers (used by tests that need direct locator access) ──────────

  async getEmailInput()    { return this.emailInput; }
  async getPasswordInput() { return this.passwordInput; }
  async getSignInButton()  { return this.signInButton; }

  // ── Assertions (state helpers, not expect() — keep expects in tests) ─────────

  async isErrorVisible(): Promise<boolean> {
    return this.errorMessage.isVisible();
  }

  async getErrorText(): Promise<string> {
    return (await this.errorMessage.textContent()) ?? '';
  }
}
