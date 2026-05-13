import { test, expect } from '@playwright/test';
import { DashboardPage } from '../../pages/DashboardPage';
test.use({ storageState: '.auth/signer.json' });
test.describe('@auth logout flows', () => {

  test('authenticated user can access dashboard', async ({ page }) => {
    await page.goto('/documents');
    await expect(page).not.toHaveURL(/signin/);
  });

  test('logout redirects to signin page', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.logout();
    await expect(page).toHaveURL(/signin/);
  });

  test('unauthenticated user cannot access protected route', async ({ page, context }) => {
    // Clear session to simulate logged out state
    await context.clearCookies();
    await page.goto('/documents');
    await expect(page).toHaveURL(/signin/);
  });
});
