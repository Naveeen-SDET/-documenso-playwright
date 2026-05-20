import { test, expect } from '../fixtures';

test.use({ storageState: '.auth/sender.json' });

test.describe('@smoke @ui document list', () => {

  test.beforeEach(async ({}, testInfo) => {
    testInfo.skip(!!process.env.CI, 'Requires local Docker stack');
  });

  test('dashboard loads when authenticated', async ({ dashboardPage }) => {
    await expect(dashboardPage.getPage()).toHaveURL(/documents/);
  });

  test('API returns documents array', async ({ docsApi }, testInfo) => {
    testInfo.skip(!process.env.DOCUMENSO_API_KEY && true, 'Requires API key');
    const result = await docsApi.list({ page: 1, perPage: 10 });
    expect(result).toHaveProperty('documents');
    expect(Array.isArray(result.documents)).toBe(true);
  });

});