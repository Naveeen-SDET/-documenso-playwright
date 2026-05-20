import { test, expect } from '../fixtures';
import { DocumentSchema } from '../../schemas/document.schema';

/**
 * Document Lifecycle Tests — Advanced Fixture Composition
 *
 * What this demonstrates
 * ──────────────────────
 * These tests use the `seededDocument` and `authenticatedApi` fixtures from
 * tests/fixtures.ts. The fixtures handle ALL setup and teardown automatically:
 *
 *   seededDocument:
 *     BEFORE test → POST /api/v1/documents (uploads sample.pdf)
 *     test runs   → receives the Document object
 *     AFTER test  → DELETE /api/v1/documents/:id (always, even on failure)
 *
 *   authenticatedApi:
 *     Provides a pre-configured DocumentsApi, skips if no API key.
 *
 * Why this is better than beforeEach/afterEach:
 *   If a test throws mid-way, `afterEach` may not run. Fixture teardown is
 *   guaranteed because it's in a try/finally inside the fixture function.
 *   This prevents leaked test data from polluting subsequent test runs.
 *
 * Run: pnpm exec playwright test tests/api/document-lifecycle.spec.ts --project=ci
 * Requires: Docker running + DOCUMENSO_API_KEY set in .env
 * Without Docker: all tests skip gracefully.
 */

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Read operations on a seeded document
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @fixture Document lifecycle — read operations', () => {

  test('GET by ID returns the seeded document with correct schema', async ({
    seededDocument,
    authenticatedApi,
  }) => {
    const doc = await authenticatedApi.getById(seededDocument.id);

    // ── Identity ──────────────────────────────────────────────────────────────
    expect(doc.id).toBe(seededDocument.id);

    // ── Schema validation — use the Zod contract ──────────────────────────────
    const parsed = DocumentSchema.safeParse(doc);
    expect(
      parsed.success,
      `GET /documents/${seededDocument.id} response failed schema validation:\n` +
      (parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2))
    ).toBe(true);
  });

  test('seeded document appears in the list response', async ({
    seededDocument,
    authenticatedApi,
  }) => {
    // Use a large perPage to avoid pagination masking the document
    const list = await authenticatedApi.list({ page: 1, perPage: 100 });

    const found = list.documents.find(d => d.id === seededDocument.id);
    expect(
      found,
      `Document id=${seededDocument.id} not found in list response`
    ).toBeDefined();
  });

  test('seeded document has DRAFT status immediately after creation', async ({
    seededDocument,
    authenticatedApi,
  }) => {
    const doc = await authenticatedApi.getById(seededDocument.id);

    // A freshly uploaded document should always be in DRAFT
    expect(doc.status).toBe('DRAFT');
  });

  test('seeded document title matches what was passed to create()', async ({
    seededDocument,
    authenticatedApi,
  }) => {
    const doc = await authenticatedApi.getById(seededDocument.id);

    // Verify the API persisted the title we sent
    expect(doc.title).toBe(seededDocument.title);
    expect(doc.title).toMatch(/^fixture-doc-\d+$/);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Delete lifecycle (fixture handles cleanup even after deletion)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @fixture Document lifecycle — delete operation', () => {

  test('DELETE removes the document and GET returns 404', async ({
    seededDocument,
    authenticatedApi,
    request,
  }) => {
    const { id } = seededDocument;

    // ── Step 1: Confirm the document exists ──────────────────────────────────
    const before = await authenticatedApi.getById(id);
    expect(before.id).toBe(id);

    // ── Step 2: Delete it ────────────────────────────────────────────────────
    await authenticatedApi.delete(id);

    // ── Step 3: GET should now return 404 ────────────────────────────────────
    const res = await request.get(
      `${process.env.BASE_URL ?? 'http://localhost:3000'}/api/v1/documents/${id}`,
      { headers: { Authorization: `Bearer ${process.env.DOCUMENSO_API_KEY}` } }
    );
    expect(res.status()).toBe(404);

    // ── Step 4: Document absent from list ────────────────────────────────────
    const list = await authenticatedApi.list({ page: 1, perPage: 100 });
    const stillExists = list.documents.some(d => d.id === id);
    expect(stillExists, `Document id=${id} still appears in list after deletion`).toBe(false);

    // Note: the fixture's teardown will attempt DELETE again after this test.
    // It will get a 404 and swallow it silently — this is the expected behaviour.
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — authenticatedApi fixture (no seeded document needed)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @fixture authenticatedApi fixture', () => {

  test('list returns valid schema without needing a seeded document', async ({
    authenticatedApi,
  }) => {
    // authenticatedApi skips automatically if no API key — no guard needed here
    const list = await authenticatedApi.list({ page: 1, perPage: 10 });

    expect(typeof list.totalPages).toBe('number');
    expect(Array.isArray(list.documents)).toBe(true);
    expect(list.totalPages).toBeGreaterThanOrEqual(0);
  });

  test('GET non-existent document returns 404', async ({
    authenticatedApi,
    request,
  }) => {
    const res = await request.get(
      `${process.env.BASE_URL ?? 'http://localhost:3000'}/api/v1/documents/999999`,
      { headers: { Authorization: `Bearer ${process.env.DOCUMENSO_API_KEY}` } }
    );
    expect(res.status()).toBe(404);
  });

});
