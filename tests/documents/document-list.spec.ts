import { test, expect } from '@playwright/test';
import { DashboardPage } from '../../pages/DashboardPage';

test.describe('@ui document list', () => {
  test('dashboard loads when authenticated', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const loaded = await dashboard.isLoaded();
    expect(loaded).toBe(true);
  });

  test('dashboard URL contains /documents', async ({ page }) => {
    await page.goto('/documents');
    await expect(page).toHaveURL(/documents/);
  });
});