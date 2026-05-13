import { test, expect } from '@playwright/test';
import {
  DocumentListSchema,
  DocumentSchema,
  ApiErrorSchema,
} from '../../schemas/document.schema';
import { env } from '../../config/env';

/**
 * Contract Testing with Zod Schema Validation
 *
 * What is contract testing?
 * ─────────────────────────
 * A contract test asserts that an API response matches a defined schema.
 * If the API team renames "totalPages" to "pageCount", this test fails.
 * If they change "id" from number to string, this test fails.
 * Without contract tests, that change silently breaks your frontend.
 *
 * Why Zod?
 * ─────────
 * Zod gives us runtime type validation with TypeScript inference.
 * .parse()      → throws a detailed error if shape is wrong
 * .safeParse()  → returns { success, data, error } without throwing
 *
 * Why this matters for regulated industries:
 * ───────────────────────────────────────────
 * Documenso handles legally binding documents. A breaking API change
 * that goes undetected could mean signers can't complete documents,
 * or audit logs stop recording — both are compliance failures.
 *
 * Run: pnpm exec playwright test tests/api/contracts.spec.ts --project=ci --reporter=list
 */

const V1 = `${env.baseUrl}/api/v1`;

function skipIfNoToken(testInfo: { skip: (condition: boolean, reason: string) => void }) {
  testInfo.skip(!env.apiKey, 'Requires DOCUMENSO_API_KEY — skipped in CI');
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Unauthenticated contract tests (safe in CI, no API key needed)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @contract Contract — unauthenticated responses', () => {

  test('GET /documents without token returns valid error schema', async ({ request }) => {
    const res = await request.get(`${V1}/documents`);

    expect(res.ok()).toBe(false);
    expect([400, 401, 403]).toContain(res.status());

    const body = await res.json();
    const result = ApiErrorSchema.safeParse(body);

    expect(
      result.success,
      `Error response shape invalid: ${result.success ? '' : JSON.stringify(result.error.issues)}`
    ).toBe(true);
  });

  test('GET /documents with invalid token returns valid error schema', async ({ request }) => {
    const res = await request.get(`${V1}/documents`, {
      headers: { Authorization: 'Bearer invalid-token-abc123' },
    });

    expect(res.ok()).toBe(false);
    const body = await res.json();
    const result = ApiErrorSchema.safeParse(body);

    expect(
      result.success,
      `Error shape invalid: ${result.success ? '' : JSON.stringify(result.error.issues)}`
    ).toBe(true);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Authenticated contract tests (require DOCUMENSO_API_KEY)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @contract Contract — document list schema', () => {

  test.beforeEach(({}, testInfo) => skipIfNoToken(testInfo));

  test('GET /documents response matches DocumentListSchema exactly', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=1&perPage=10`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();

    const parsed = DocumentListSchema.safeParse(body);

    expect(
      parsed.success,
      `DocumentListSchema validation failed:\n${parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2)}`
    ).toBe(true);
  });

  test('documents array contains only valid DocumentSchema objects', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=1&perPage=20`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });

    const body = await res.json();

    for (const doc of body.documents) {
      const result = DocumentSchema.safeParse(doc);
      expect(
        result.success,
        `Document id=${doc.id} failed schema:\n${result.success ? '' : JSON.stringify(result.error.issues, null, 2)}`
      ).toBe(true);
    }
  });

  test('totalPages is a non-negative number', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=1&perPage=10`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });

    const body = await res.json();

    expect(typeof body.totalPages).toBe('number');
    expect(body.totalPages).toBeGreaterThanOrEqual(0);
  });

  test('GET /documents/:id response matches DocumentSchema', async ({ request }) => {
    const list = await request.get(`${V1}/documents?page=1&perPage=5`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    const listBody = await list.json();

    if (listBody.documents.length === 0) {
      test.skip(true, 'No documents in account — upload one first');
      return;
    }

    const targetId = listBody.documents[0].id;
    const res = await request.get(`${V1}/documents/${targetId}`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();

    const result = DocumentSchema.safeParse(body);
    expect(
      result.success,
      `DocumentSchema failed for id=${targetId}:\n${result.success ? '' : JSON.stringify(result.error.issues, null, 2)}`
    ).toBe(true);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Field type assertions
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @contract Contract — field type assertions', () => {

  test.beforeEach(({}, testInfo) => skipIfNoToken(testInfo));

  test('document id is always a number, never a string', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=1&perPage=10`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    const body = await res.json();

    for (const doc of body.documents) {
      expect(typeof doc.id, `id should be number, got ${typeof doc.id}`).toBe('number');
    }
  });

  test('document status is always a known enum value', async ({ request }) => {
    const validStatuses = ['DRAFT', 'PENDING', 'COMPLETED', 'DECLINED', 'CANCELLED'];
    const res = await request.get(`${V1}/documents?page=1&perPage=20`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    const body = await res.json();

    for (const doc of body.documents) {
      expect(validStatuses, `Unknown status: ${doc.status}`).toContain(doc.status);
    }
  });

  test('createdAt and updatedAt are ISO date strings', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=1&perPage=10`, {
      headers: { Authorization: `Bearer ${env.apiKey}` },
    });
    const body = await res.json();

    for (const doc of body.documents) {
      expect(
        isNaN(Date.parse(doc.createdAt)),
        `createdAt "${doc.createdAt}" is not a valid date`
      ).toBe(false);

      expect(
        isNaN(Date.parse(doc.updatedAt)),
        `updatedAt "${doc.updatedAt}" is not a valid date`
      ).toBe(false);
    }
  });

});
