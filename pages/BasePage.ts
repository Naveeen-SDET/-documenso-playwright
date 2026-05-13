import { Page } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string = '/') {
    await this.page.goto(path);
    await this.waitForLoad();
  }

  async waitForLoad() {
  await this.page.waitForLoadState('domcontentloaded');
}

  async getTitle(): Promise<string> {
    return this.page.title();
  }
}