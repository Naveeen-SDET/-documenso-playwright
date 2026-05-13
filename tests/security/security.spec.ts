import { test, expect } from '@playwright/test';
import { env } from '../../config/env';

test.describe('@security @regression Security — Auth & RBAC', () => {

  test.describe('Unauthenticated API access', () => {
    test('GET /api/v1/documents returns 400 without token', async ({ request }) => {
      const res = await request.get(`${env.baseUrl}/api/v1/documents`);
      expect(res.status()).toBe(400);
    });

    test('invalid token is rejected', async ({ request }) => {
      const res = await request.get(`${env.baseUrl}/api/v1/documents`, {
        headers: { Authorization: 'Bearer invalid_token_abc123' },
      });
      expect([400, 401, 403]).toContain(res.status());
    });

    test('tampered token is rejected', async ({ request }) => {
      const tampered = (env.apiKey ?? 'api_test') + '_tampered';
      const res = await request.get(`${env.baseUrl}/api/v1/documents`, {
        headers: { Authorization: `Bearer ${tampered}` },
      });
      expect([400, 401, 403]).toContain(res.status());
    });
  });

  test.describe('Protected UI routes redirect to signin', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    const protectedRoutes = [
      '/documents',
      '/settings/profile',
      '/settings/security',
      '/settings/tokens',
    ];

    for (const route of protectedRoutes) {
      test(`${route} redirects unauthenticated user`, async ({ page }) => {
        await page.goto(route);
        await expect(page).toHaveURL(/signin/);
      });
    }
  });

  test.describe('Authenticated API access', () => {
    test.skip(!env.apiKey, 'Requires API key — skipped in CI without token');

    test('valid token can list documents', async ({ request }) => {
      const res = await request.get(`${env.baseUrl}/api/v1/documents`, {
        headers: { Authorization: `Bearer ${env.apiKey}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('documents');
    });
  });

});
