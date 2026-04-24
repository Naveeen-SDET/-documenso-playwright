import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
  private readonly newDocumentButton: Locator;
  private readonly documentsList: Locator;
  private readonly userMenuButton: Locator;

  constructor(page: Page) {
    super(page);
    // Adjust these if the text differs — check the app in your browser
    this.newDocumentButton = page.getByRole('link', { name: /new document/i })
      .or(page.getByRole('button', { name: /new document/i }));
    this.documentsList  = page.locator('[data-testid="document-table"]')
      .or(page.getByRole('table'));
    this.userMenuButton = page.getByRole('button', { name: /account|profile|user/i })
      .or(page.locator('[data-testid="user-menu"]'));
  }

  async goto() {
    await super.goto('/documents');
  }

 async isLoaded(): Promise<boolean> {
  await this.waitForLoad();
  const url = this.page.url();
  return url.includes('/documents') || url.includes('/dashboard') || !url.includes('/signin');

  }
  async logout() {
  await this.page.getByTestId('menu-switcher').click();
  await this.page.getByRole('menuitem', { name: /sign out/i })
    .or(this.page.getByText('Sign out'))
    .click();
  await this.page.waitForURL(/signin/, { timeout: 10000 });
}

  async getNewDocumentButton() { return this.newDocumentButton; }
  async getDocumentsList()     { return this.documentsList; }
}