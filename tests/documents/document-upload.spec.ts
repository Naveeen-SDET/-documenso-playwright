import { test, expect } from '@playwright/test';
import { DashboardPage } from '../../pages/DashboardPage';
import * as path from 'path';

test.use({ storageState: '.auth/sender.json' });

const SAMPLE_PDF = path.resolve(__dirname, '../fixtures/sample.pdf');

test.describe('@upload document upload', () => {
  test('uploading a PDF creates a new draft document', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Trigger file chooser via New Document button
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
     await dashboard.newDocumentButton.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_PDF);

    // Wait for redirect to document editor after upload
    await page.waitForURL(/\/documents\/[^/]+/, { timeout: 20000 });
    await expect(page).toHaveURL(/\/documents\/[^/]+/);
  });

  test('uploaded document appears in dashboard list', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
    await dashboard.newDocumentButton.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_PDF);

    // Wait for upload then go back to dashboard
   await page.waitForURL(/\/documents\/[^/]+/, { timeout: 20000 });
    await dashboard.goto();

    // At least one document row exists
    await expect(page.getByRole('row').or(page.getByTestId('document-list-item')).first()).toBeVisible();
  });
});
