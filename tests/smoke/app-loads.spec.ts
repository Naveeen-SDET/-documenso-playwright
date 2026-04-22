import { test, expect } from '@playwright/test';

test.describe('smoke', () => {
  test('redirects unauthenticated user to signin', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/signin/);
  });

  test('signin page has email and password inputs', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('valid login reaches dashboard', async ({ page }) => {
    await page.goto('/signin');
    await page.getByLabel(/email/i).fill('sender@test.com');
    await page.locator('input[type="password"]').fill('Test1234!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/signin/);
  });
});