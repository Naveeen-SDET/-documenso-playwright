import { test, expect } from '@playwright/test';
import { env } from '../../config/env';

const V1   = `${env.baseUrl}/api/v1`;
const AUTH = { 'Authorization': `Bearer ${env.apiKey}` };

/**
 * Day 12 — API layer tests using Playwright's request fixture
 *
 * Strategy: test the v1 documents API (deprecated but stable).
 * v2 uses a presigned-URL document creation flow not covered here.
 * Coverage: auth guards, happy path, response schema, pagination.
 */

test.describe('@api documents API', () => {

  // ── Auth guards ─────────────────────────────────────────────────────────────

  test('no token returns 400', async ({ request }) => {
    const res = await request.get(`${V1}/documents`);
    expect(res.status()).toBe(400);
  });

  test('invalid token is rejected', async ({ request }) => {
    const res = await request.get(`${V1}/documents`, {
      headers: { 'Authorization': 'Bearer not_a_real_token_xyz' },
    });
    expect(res.ok()).toBe(false);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  test('valid token returns 200', async ({ request }) => {
    const res = await request.get(`${V1}/documents`, { headers: AUTH });
    expect(res.status()).toBe(200);
  });

  // ── Schema validation ────────────────────────────────────────────────────────

  test('response body has documents array + totalPages', async ({ request }) => {
    const res = await request.get(`${V1}/documents`, { headers: AUTH });
    const body = await res.json();

    expect(body).toHaveProperty('documents');
    expect(Array.isArray(body.documents)).toBe(true);
    expect(body).toHaveProperty('totalPages');
    expect(typeof body.totalPages).toBe('number');
  });

  test('each document has id, title and status fields', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=1&perPage=5`, { headers: AUTH });
    const body = await res.json();

    for (const doc of body.documents) {
      expect(doc).toHaveProperty('id');
      expect(doc).toHaveProperty('title');
      expect(doc).toHaveProperty('status');
      expect(typeof doc.id).toBe('number');
      expect(typeof doc.status).toBe('string');
    }
  });

  // ── Pagination ──────────────────────────────────────────────────────────────

  test('perPage=3 returns at most 3 documents', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=1&perPage=3`, { headers: AUTH });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.documents.length).toBeLessThanOrEqual(3);
  });

  test('page beyond total returns empty documents array', async ({ request }) => {
    const res = await request.get(`${V1}/documents?page=9999&perPage=10`, { headers: AUTH });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.documents)).toBe(true);
    expect(body.documents.length).toBe(0);
  });

});