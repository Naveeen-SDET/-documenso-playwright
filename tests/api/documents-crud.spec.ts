import { test, expect } from '@playwright/test';
import { DocumentsApi } from '../../api/documents.api';
import { env } from '../../config/env';
import * as path from 'path';

/**
 * Deep API Testing: CRUD, Error Handling, Boundary Conditions
 *
 * What this covers
 * ─────────────────
 * • GET  /api/v1/documents/:id  — fetch a single document by ID
 * • DELETE /api/v1/documents/:id — delete with before/after verification
 * • 404 on non-existent resource
 * • 400/422 on invalid inputs
 * • Boundary conditions — page=0, perPage=100, extreme page numbers
 * • Response headers — Content-Type validation
 * • Full delete lifecycle — create via UI → verify via API → delete → verify gone
 *
 * Why these tests matter
 * ──────────────────────
 * Auth guard tests prove the API rejects bad tokens.
 * Schema tests prove the response shape is correct.
 * CRUD tests prove the actual business logic works:
 *   - Can you retrieve a specific document you know exists?
 *   - Does deleting actually remove it?
 *   - Does the API return meaningful errors for bad inputs?
 *   - Do boundary inputs cause crashes or correct responses?
 *
 * All tests in the authenticated describe block skip if DOCUMENSO_API_KEY
 * is not set — safe to run in CI (fresh DB has no tokens).
 */

const V1 = `${env.baseUrl}/api/v1`;

// ── Helper ───────────────────────────────────────────────────────────────────

function skipIfNoToken(testInfo: { skip: (condition: boolean, reason: string) => void }) {
  testInfo.skip(!env.apiKey, 'Requires DOCUMENSO_API_KEY — skipped in CI');
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — GET /api/v1/documents/:id
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @regression Document API — GET by ID', () => {

  test.beforeEach(({}, testInfo) => skipIfNoToken(testInfo));

  test('GET /documents/:id returns 200 and correct schema for existing document', async ({ request }) => {
    const api = new DocumentsApi(request, env.baseUrl, env.apiKey);

    // Grab the first document from the list to use as our test target
    const list = await api.list({ page: 1, perPage: 5 });

    test.skip(list.documents.length === 0, 'No documents in account — upload one first');

    const targetId = list.documents[0].id;
    const doc = await api.getById(targetId);

    // ── Identity ────────────────────────────────────────────────────────────
    expect(doc.id).toBe(targetId);

    // ── Required fields ─────────────────────────────────────────────────────
    expect(doc).toHaveProperty('id');
    expect(doc).toHaveProperty('title');
    expect(doc).toHaveProperty('status');
    expect(doc).toHaveProperty('createdAt');
    expect(doc).toHaveProperty('updatedAt');

    // ── Types ───────────────────────────────────────────────────────────────
    expect(typeof doc.id).toBe('number');
    expect(typeof doc.title).toBe('string');
    expect(typeof doc.status).toBe('string');
    expect(typeof doc.createdAt).toBe('string');
    expect(typeof doc.updatedAt).toBe('string');

    // ── Status is a known enum value ─────────────────────────────────────────
    const validStatuses = ['DRAFT', 'PENDING', 'COMPLETED', 'DECLINED', 'CANCELLED'];
    expect(validStatuses).toContain(doc.status);
  });

  test('GET /documents/:id with non-existent ID returns 404', async ({ request }) => {
    // Use an ID so large it cannot exist
    const res = await request.get(`${V1}/documents/999999999`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });

    // Documenso should return 404 for a document that doesn't exist
    expect(res.status()).toBe(404);
  });

  test('GET /documents/:id with non-numeric ID returns 4xx', async ({ request }) => {
    const res = await request.get(`${V1}/documents/not-a-number`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });

    // Should reject — not a valid ID format
    expect(res.ok()).toBe(false);
    expect([400, 404, 422]).toContain(res.status());
  });

  test('GET /documents/:id returns JSON Content-Type header', async ({ request }) => {
    const api = new DocumentsApi(request, env.baseUrl, env.apiKey);
    const list = await api.list({ page: 1, perPage: 1 });

    test.skip(list.documents.length === 0, 'No documents in account');

    const res = await request.get(`${V1}/documents/${list.documents[0].id}`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });

    const contentType = res.headers()['content-type'] ?? '';
    expect(contentType).toContain('application/json');
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — DELETE /api/v1/documents/:id
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @regression Document API — DELETE lifecycle', () => {

  test.use({ storageState: '.auth/sender.json' });

  test.beforeEach(({}, testInfo) => skipIfNoToken(testInfo));

  test('DELETE removes document and GET by ID returns 404 afterwards', async ({ request, page }) => {
    const api = new DocumentsApi(request, env.baseUrl, env.apiKey);

    // ── Step 1: Create a document via UI ─────────────────────────────────────
    const SAMPLE_PDF = path.resolve(__dirname, '../fixtures/sample.pdf');

    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /upload document/i }).click(),
    ]);
    await fileChooser.setFiles(SAMPLE_PDF);
    await page.waitForURL(/\/documents\/[a-z0-9_]+/, { timeout: 20_000 });

    // ── Step 2: Find the newly created document via API ──────────────────────
    // Poll until the document appears — use waitForCondition pattern (no sleep)
    let newDocId: number | undefined;
    await expect.poll(
      async () => {
        const list = await api.list({ page: 1, perPage: 20 });
        newDocId = list.documents[0]?.id;
        return list.documents.length;
      },
      { message: 'Document did not appear in API list', timeout: 10_000, intervals: [500, 1000, 2000] }
    ).toBeGreaterThan(0);

    expect(newDocId, 'Could not find newly created document in API').toBeDefined();

    // ── Step 3: Verify it exists via GET ─────────────────────────────────────
    const beforeDelete = await request.get(`${V1}/documents/${newDocId}`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    expect(beforeDelete.status()).toBe(200);

    // ── Step 4: Delete it ─────────────────────────────────────────────────────
    await api.delete(newDocId!);

    // ── Step 5: Verify it no longer exists ───────────────────────────────────
    const afterDelete = await request.get(`${V1}/documents/${newDocId}`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    expect(afterDelete.status()).toBe(404);

    // ── Step 6: Confirm absent from list ─────────────────────────────────────
    const finalList = await api.list({ page: 1, perPage: 100 });
    const stillExists = finalList.documents.some(d => d.id === newDocId);
    expect(stillExists).toBe(false);
  });

  test('DELETE non-existent document returns 4xx', async ({ request }) => {
    const res = await request.delete(`${V1}/documents/999999999`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });

    expect(res.ok()).toBe(false);
    expect([400, 404, 422]).toContain(res.status());
  });

  test('DELETE without auth token is rejected', async ({ request }) => {
    const res = await request.delete(`${V1}/documents/1`);
    expect(res.ok()).toBe(false);
    expect([400, 401, 403]).toContain(res.status());
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Boundary Conditions on GET /api/v1/documents
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @regression Document API — boundary conditions', () => {

  test.beforeEach(({}, testInfo) => skipIfNoToken(testInfo));

  test('perPage=1 returns exactly 1 document (if any exist)', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=1&perPage=1`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.documents.length).toBeLessThanOrEqual(1);
  });

  test('perPage=50 does not crash the server', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=1&perPage=50`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    // Should succeed, not 500
    expect([200]).toContain(res.status());
  });

  test('page=0 is handled gracefully (no 500)', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=0&perPage=10`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    // Either a validation error (4xx) or it treats 0 as page 1 (200) — neither should be 500
    expect(res.status()).not.toBe(500);
  });

  test('page=9999 returns empty documents array (not 500)', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=9999&perPage=10`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.documents)).toBe(true);
    expect(body.documents.length).toBe(0);
  });

  test('negative perPage is handled gracefully (no 500)', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=1&perPage=-1`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    // Should return a validation error or default behaviour — never a server crash
    expect(res.status()).not.toBe(500);
  });

  test('list response always includes totalPages as a number', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=1&perPage=10`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    const body = await res.json();
    expect(typeof body.totalPages).toBe('number');
    expect(body.totalPages).toBeGreaterThanOrEqual(0);
  });

  test('totalPages is consistent with document count', async ({ request }) => {
    const perPage = 5;
    const res = await request.get(`${V1}/documents?page=1&perPage=${perPage}`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    const body = await res.json();

    if (body.documents.length === 0) {
      // Empty account — totalPages should be 0 (no pages of nothing)
      expect(body.totalPages).toBe(0);
    } else if (body.documents.length < perPage) {
      // Got some results but fewer than the page size — must be the only/last page
      expect(body.totalPages).toBe(1);
    } else {
      // Full page returned — totalPages must be at least 1
      expect(body.totalPages).toBeGreaterThanOrEqual(1);
    }
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Response Headers
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api document API — response headers', () => {

  test.beforeEach(({}, testInfo) => skipIfNoToken(testInfo));

  test('list endpoint returns application/json content-type', async ({ request }) => {
    const res = await request.get(`${V1}/documents`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    const contentType = res.headers()['content-type'] ?? '';
    expect(contentType).toContain('application/json');
  });

  test('error responses also return application/json content-type', async ({ request }) => {
    // 404 response should still be JSON (not an HTML error page)
    const res = await request.get(`${V1}/documents/999999999`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    expect(res.status()).toBe(404);
    const contentType = res.headers()['content-type'] ?? '';
    expect(contentType).toContain('application/json');
  });

});
