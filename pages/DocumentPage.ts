import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class DocumentPage extends BasePage {
  private readonly uploadInput: Locator;
  private readonly documentTitle: Locator;
  private readonly addSignerButton: Locator;
  private readonly sendButton: Locator;

  constructor(page: Page) {
    super(page);
    this.uploadInput    = page.locator('input[type="file"]');
    this.documentTitle  = page.getByRole('heading', { level: 1 });
    this.addSignerButton = page.getByRole('button', { name: /add signer|add recipient/i });
    this.sendButton     = page.getByRole('button', { name: /send|continue/i });
  }

  async goto() {
    await super.goto('/documents/new');
  }

  async uploadFile(filePath: string) {
    await this.uploadInput.setInputFiles(filePath);
    await this.waitForLoad();
  }

  async getUploadInput()     { return this.uploadInput; }
  async getAddSignerButton() { return this.addSignerButton; }
  async getSendButton()      { return this.sendButton; }
}