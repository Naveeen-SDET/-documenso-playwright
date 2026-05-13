import { test, expect } from '@playwright/test';
import * as path from 'path';
import { DashboardPage } from '../../pages';
import { DocumentsApi } from '../../api';
import { env } from '../../config/env';

test.use({ storageState: '.auth/sender.json' });

const SAMPLE_PDF = path.resolve(__dirname, '../fixtures/sample.pdf');

test.describe('@hybrid @regression document — UI create → API verify', () => {

  test.beforeEach(async ({}, testInfo) => {
    testInfo.skip(!!process.env.CI, 'Requires local Docker stack');
    if (!env.apiKey) {
      testInfo.skip(true, 'Requires DOCUMENSO_API_KEY');
    }
  });

  test('document created via UI appears in API with correct schema', async ({ page, request }) => {
    const docsApi = new DocumentsApi(request, env.baseUrl, env.apiKey);

    // ── Step 1: API baseline ───────────────────────────────────────────────
    const before = await docsApi.list({ page: 1, perPage: 100 });
    const idsBefore = new Set(before.documents.map(d => d.id));

    // ── Step 2: UI — create document ───────────────────────────────────────
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      dashboard.newDocumentButton.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_PDF);

    // Wait for redirect to the document editor (new URL format)
    await page.waitForURL(/\/documents\/[a-z0-9_]+/, { timeout: 20_000 });

    // ── Step 3: API — find the new document ───────────────────────────────
    const after = await docsApi.list({ page: 1, perPage: 100 });
    const newDoc = after.documents.find(d => !idsBefore.has(d.id));

    expect(newDoc).toBeDefined();
    const documentId = newDoc!.id;

    // ── Step 4: API — verify schema ───────────────────────────────────────
    const doc = await docsApi.getById(documentId);
    expect(doc.id).toBe(documentId);
    expect(doc).toHaveProperty('status');
    expect(doc).toHaveProperty('title');

    // ── Step 5: API cleanup ────────────────────────────────────────────────
    await docsApi.delete(documentId);

    const final = await docsApi.list({ page: 1, perPage: 100 });
    const stillExists = final.documents.some(d => d.id === documentId);
    expect(stillExists).toBe(false);
  });

});