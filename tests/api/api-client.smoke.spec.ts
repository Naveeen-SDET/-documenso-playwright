import { test, expect } from '@playwright/test';
import { DocumentsApi } from '../../api';
import { env } from '../../config/env';

/**
 * Day 13 — Typed API client smoke tests
 * Verifies the client layer works correctly on top of the raw request fixture.
 */
test.describe('@api typed API client', () => {

  test.beforeEach(async ({}, testInfo) => {
    if (!env.apiKey) {
      testInfo.skip(true, 'Requires DOCUMENSO_API_KEY');
    }
  });

  test('DocumentsApi.list() returns typed response', async ({ request }) => {
    const docs = new DocumentsApi(request, env.baseUrl, env.apiKey);
    const result = await docs.list();

    expect(result).toHaveProperty('documents');
    expect(result).toHaveProperty('totalPages');
    expect(Array.isArray(result.documents)).toBe(true);
  });

  test('DocumentsApi.list() respects perPage param', async ({ request }) => {
    const docs = new DocumentsApi(request, env.baseUrl, env.apiKey);
    const result = await docs.list({ page: 1, perPage: 2 });

    expect(result.documents.length).toBeLessThanOrEqual(2);
  });

  test('DocumentsApi throws on invalid token', async ({ request }) => {
    const docs = new DocumentsApi(request, env.baseUrl, 'bad_token');

    await expect(docs.list()).rejects.toThrow();
  });

});