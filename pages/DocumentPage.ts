import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class DocumentPage extends BasePage {
  private readonly uploadInput: Locator;
  readonly statusBadge: Locator;
  private readonly addSignerButton: Locator;
  private readonly signerNameInput: Locator;
  private readonly signerEmailInput: Locator;
  readonly recipientList: Locator;
  private readonly sendButton: Locator;
  private readonly sendConfirmButton: Locator;

  constructor(page: Page) {
    super(page);

    this.uploadInput = page.locator('input[type="file"]');

    this.statusBadge = page.getByTestId('document-status')
      .or(page.getByRole('status'));

    this.addSignerButton = page.getByRole('button', { name: 'Add Signer' }).last();
    this.signerNameInput = page.getByLabel('Name').last();
    this.signerEmailInput = page.getByTestId('signer-email-input').last();

    this.recipientList = page.getByTestId('recipient-list')
      .or(page.locator('[data-testid*="signer"]').first());

    this.sendButton = page.getByRole('navigation')
      .getByRole('button', { name: 'Send Document' });
    this.sendConfirmButton = page.getByRole('dialog')
      .getByRole('button', { name: /^send$/i });
  }

  async goto() {
    await super.goto('/documents/new');
  }

  async uploadFile(filePath: string) {
    await this.uploadInput.setInputFiles(filePath);
    await this.waitForLoad();
  }

  async addSigner(name: string, email: string): Promise<void> {
    await this.addSignerButton.click();
    await this.signerNameInput.fill(name);
    await this.signerEmailInput.fill(email);
    await this.signerEmailInput.press('Enter');
  }

  async proceedToAddFields(): Promise<void> {
    await this.page.getByRole('button', { name: 'Add Fields', exact: true }).click();
    await this.page.waitForLoadState('domcontentloaded');
  }

async placeSignatureField(): Promise<void> {
  await this.page.getByRole('heading', { name: 'Add Fields' }).waitFor({ state: 'visible' });

  // Use :has() to find the group container that wraps the Signature label
  const signatureField = this.page.locator('.group:has(p.font-signature)').first();
  await signatureField.waitFor({ state: 'visible' });

  const sourceBox = await signatureField.boundingBox();
  if (!sourceBox) throw new Error('Signature field not found');

  // Target the parent of canvas — the actual drop zone container
  const pdfDropZone = this.page.locator('canvas').locator('xpath=..').first();
  const targetBox = await pdfDropZone.boundingBox();
  if (!targetBox) throw new Error('PDF drop zone not found');

  const srcX = sourceBox.x + sourceBox.width / 2;
  const srcY = sourceBox.y + sourceBox.height / 2;
  const tgtX = targetBox.x + targetBox.width / 2;
  const tgtY = targetBox.y + targetBox.height / 2;

  // Micro-movement first — triggers dnd-kit dragStart threshold
  await this.page.mouse.move(srcX, srcY);
  await this.page.mouse.down();
  await this.page.mouse.move(srcX + 3, srcY + 3, { steps: 3 });
  // Then move to the PDF drop zone slowly
  await this.page.mouse.move(tgtX, tgtY, { steps: 20 });
  await this.page.mouse.up();
}
  async sendDocument(): Promise<void> {
    await this.sendButton.click();
    const dialog = this.page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });

    const checkbox = dialog.getByRole('checkbox');
    if (await checkbox.count() > 0) {
      await checkbox.first().check();
    }

    const confirmBtn = dialog.getByRole('button', { name: /^send$/i });
    await confirmBtn.waitFor({ state: 'visible' });
    await confirmBtn.click();
  }

  async getStatus(): Promise<string> {
    return (await this.statusBadge.textContent()) ?? '';
  }

  async getRecipientCount(): Promise<number> {
    return this.recipientList.getByRole('listitem').count();
  }

  async getAddSignerButton() { return this.addSignerButton; }
  async getSendButton()      { return this.sendButton; }
}