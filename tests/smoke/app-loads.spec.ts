import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { env } from '../../config/env';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('@smoke', () => {
  test('redirects unauthenticated user to signin', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/signin/);
  });

  test('signin page has email and password inputs', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.locator('input[type="email"], input[name="email"], input[id="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  // Login success path covered by tests/auth/login.spec.ts
});
