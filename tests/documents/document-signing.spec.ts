import { test, expect } from '@playwright/test';
import { DashboardPage } from '../../pages/DashboardPage';
import { DocumentPage } from '../../pages/DocumentPage';
import * as path from 'path';

test.use({ storageState: '.auth/sender.json' });

const SAMPLE_PDF = path.resolve(__dirname, '../fixtures/sample.pdf');

test.describe('@signing document signing flow', () => {
  test.beforeEach(({}, testInfo) => {
    testInfo.skip(!!process.env.CI, 'Requires pre-seeded account — run locally');
  });

  async function uploadAndNavigate(page: import('@playwright/test').Page) {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      dashboard.newDocumentButton.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_PDF);
    await page.waitForURL(/\/documents\/[^/]+/, { timeout: 20000 });
    return new DocumentPage(page);
  }

  test('can add a signer to an uploaded document', async ({ page }) => {
    const docPage = await uploadAndNavigate(page);
    await docPage.addSigner('Test Signer', 'signer@test.com');
    await expect(page.getByText('signer@test.com')).toBeVisible();
  });

  test('send dialog validates missing signature fields', async ({ page }) => {
    const docPage = await uploadAndNavigate(page);
    await docPage.addSigner('Test Signer', 'signer@test.com');

    await page.getByRole('navigation')
      .getByRole('button', { name: 'Send Document' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/missing signature fields/i)).toBeVisible();
    await expect(dialog.getByText('signer@test.com')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();
  });
});