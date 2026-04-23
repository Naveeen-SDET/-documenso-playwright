import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly signInButton: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput    = page.getByLabel(/email/i);
    this.passwordInput = page.locator('input[type="password"]');
    this.signInButton  = page.getByRole('button', { name: /sign in/i });
  }

  async goto() {
    await super.goto('/signin');
  }

 async login(email: string, password: string) {
  await this.goto();
  await this.emailInput.fill(email);
  await this.passwordInput.fill(password);
  await this.signInButton.click();
  await this.page.waitForURL(url => !url.toString().includes('/signin'), { timeout: 15000 });
  await this.waitForLoad();

  }

  async getEmailInput()    { return this.emailInput; }
  async getPasswordInput() { return this.passwordInput; }
  async getSignInButton()  { return this.signInButton; }
}