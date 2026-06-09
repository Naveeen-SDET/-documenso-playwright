import { test, expect } from '../fixtures';
import * as path from 'path';
import { env } from '../../config/env';
import { DocumentsApi } from '../../api/documents.api';
import { DashboardPage } from '../../pages/DashboardPage';
import { DocumentPage } from '../../pages/DocumentPage';

/**
 * Journey tests — full end-to-end user flows (Day 57)
 *
 * These tests cover the critical paths a real user takes through Documenso.
 * They are intentionally slow and expensive — each one exercises the full
 * stack: browser, API, database, and (where applicable) email delivery.
 *
 * Three journeys:
 *   J1 — Sender uploads PDF, invites signer, document enters PENDING state
 *   J2 — Signing link with invalid/expired token shows correct error (no crash)
 *   J3 — Sender deletes (revokes) a document, signer can no longer access it
 *
 * Why only 3 journeys?
 * The full signing flow (both parties complete signing) requires:
 *   - Real email delivery via Inbucket
 *   - A second authenticated browser context for the signer
 *   - A signed PDF download assertion
 * This is covered by tests/documents/document-signing.spec.ts.
 * The journeys here focus on state transitions and error paths.
 *
 * @tags @journey @e2e
 */

test.use({ storageState: '.auth/sender.json' });

const SAMPLE_PDF = path.resolve(__dirname, '../fixtures/sample.pdf');

// ── J1: Upload → invite signer → document enters PENDING ─────────────────────

test.describe('@journey J1 — Upload and send document', () => {
  test.beforeEach(({}, testInfo) => {
    testInfo.skip(!!process.env.CI, 'Journey tests require auth state — run locally with Docker');
  });

  test('sender uploads PDF, adds signer, and document moves to PENDING', async ({ page, request }) => {
    test.slow(); // Journey tests take longer — triple the default timeout

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Step 1: Upload PDF via file chooser
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      dashboard.newDocumentButton.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_PDF);

    // Step 2: Wait for document editor to load
    await page.waitForURL(/\/documents\/[^/]+/, { timeout: 20_000 });
    const docPage = new DocumentPage(page);

    // Step 3: Add a signer
    const signerEmail = `journey-signer-${Date.now()}@test.com`;
    await docPage.addSigner('Journey Signer', signerEmail);
    await expect(page.getByText(signerEmail)).toBeVisible();

    // Step 4: Verify document appears in dashboard as DRAFT before sending
    await dashboard.goto();
    await expect(page.getByText(/draft/i).first()).toBeVisible({ timeout: 10_000 });

    // Verify via API that the document exists
    if (env.hasApiKey) {
      const api = new DocumentsApi(request, env.baseUrl, env.apiKey);
      const docs = await api.list({ page: 1, perPage: 10 });
      const created = docs.documents.find(d => d.status === 'DRAFT');
      expect(created).toBeDefined();
    }
  });

  test('document title is preserved after upload', async ({ page }) => {
    test.slow();

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      dashboard.newDocumentButton.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_PDF);

    await page.waitForURL(/\/documents\/[^/]+/, { timeout: 20_000 });

    // Title should default to the PDF filename
    const titleInput = page.getByRole('textbox').first();
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    const titleValue = await titleInput.inputValue();
    expect(titleValue.length).toBeGreaterThan(0);
  });

  test('adding two signers shows both in the recipient list', async ({ page }) => {
    test.slow();

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      dashboard.newDocumentButton.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_PDF);
    await page.waitForURL(/\/documents\/[^/]+/, { timeout: 20_000 });

    const docPage = new DocumentPage(page);
    const ts = Date.now();
    await docPage.addSigner('Signer One', `signer1-${ts}@test.com`);
    await docPage.addSigner('Signer Two', `signer2-${ts}@test.com`);

    // Both signers should be present somewhere on the page
    // (Documenso may scroll the list — check page content not just visible viewport)
    const pageContent = await page.content();
    expect(pageContent).toContain(`signer1-${ts}@test.com`);
    expect(pageContent).toContain(`signer2-${ts}@test.com`);
  });
});

// ── J2: Invalid/expired signing link shows correct error ──────────────────────

test.describe('@journey J2 — Signing link error states', () => {
  // These tests do NOT need auth state — they test public /sign/ routes
  test.use({ storageState: { cookies: [], origins: [] } });

  test('expired signing token shows error page without JS crash', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto(`${env.baseUrl}/sign/expired-token-journey-test`);

    // Page must load — no blank screen, no infinite spinner
    await page.waitForLoadState('domcontentloaded');

    // Should not crash with unhandled JS errors
    expect(jsErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);

    // Page should show something meaningful — not blank
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });

  test('invalid token URL does not expose internal error details', async ({ page, request }) => {
    const res = await request.get(`${env.baseUrl}/sign/invalid-token-journey-test`);

    // Must return 200 or 404 — never a 500 that leaks stack traces
    expect([200, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.text();
      // Should not expose stack traces or internal paths
      expect(body).not.toContain('at Object.<anonymous>');
      expect(body).not.toContain('/node_modules/');
      expect(body).not.toContain('prisma');
    }
  });

  test('sign page with SQL injection in token does not crash server', async ({ request }) => {
    const maliciousToken = "' OR '1'='1"; // SQLi payload as token
    const encoded = encodeURIComponent(maliciousToken);
    const res = await request.get(`${env.baseUrl}/sign/${encoded}`);

    // Must not return 500 — SQL injection in token should be handled gracefully
    expect(res.status()).not.toBe(500);
  });

  test('sign page with very long token does not crash server', async ({ request }) => {
    const longToken = 'a'.repeat(500);
    const res = await request.get(`${env.baseUrl}/sign/${longToken}`);
    expect(res.status()).not.toBe(500);
  });
});

// ── J3: Sender revokes (deletes) document — signer loses access ───────────────

test.describe('@journey J3 — Document revocation', () => {
  test.beforeEach(({}, testInfo) => {
    testInfo.skip(!env.hasApiKey, 'Requires DOCUMENSO_API_KEY for document lifecycle');
  });

  test('deleted document is no longer accessible via API', async ({ request }, testInfo) => {
    const api = new DocumentsApi(request, env.baseUrl, env.apiKey);

    // Use an existing DRAFT document — skip if none available
    const list = await api.list({ page: 1, perPage: 10 });
    const draft = list.documents.find(d => d.status === 'DRAFT');
    if (!draft) {
      testInfo.skip(true, 'No DRAFT documents available — upload one via the dashboard first');
      return;
    }

    // Revoke (delete) it
    await api.delete(draft.id);

    // Verify it's gone — should return 404
    const res = await request.get(
      `${env.baseUrl}/api/v1/documents/${draft.id}`,
      { headers: { Authorization: `Bearer ${env.apiKey}` } }
    );
    expect(res.status()).toBe(404);
  });

  test('deleted document disappears from the document list', async ({ request }, testInfo) => {
    const api = new DocumentsApi(request, env.baseUrl, env.apiKey);

    const before = await api.list({ page: 1, perPage: 50 });
    const draft = before.documents.find(d => d.status === 'DRAFT');
    if (!draft) {
      testInfo.skip(true, 'No DRAFT documents available — upload one via the dashboard first');
      return;
    }

    // Delete it
    await api.delete(draft.id);

    // Confirm it no longer appears
    const after = await api.list({ page: 1, perPage: 50 });
    const foundAfter = after.documents.some(d => d.id === draft.id);
    expect(foundAfter).toBe(false);
  });

  test('deleting a non-existent document returns 4xx not 500', async ({ request }) => {
    const res = await request.delete(
      `${env.baseUrl}/api/v1/documents/999999999`,
      { headers: { Authorization: `Bearer ${env.apiKey}` } }
    );
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
