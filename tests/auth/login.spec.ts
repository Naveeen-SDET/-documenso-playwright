import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { env } from '../../config/env';

test.describe('@auth login flows', () => {
  // These tests need a fresh unauthenticated session
  test.use({ storageState: { cookies: [], origins: [] } });

  test('successful login redirects away from signin', async ({ page }) => {
    test.skip(!!process.env.CI, 'Requires pre-seeded account — run locally');
    const loginPage = new LoginPage(page);
    await loginPage.login(env.signerEmail, env.signerPassword);
    await expect(page).not.toHaveURL(/signin/);
  });

  test('wrong password stays on signin page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await (await loginPage.getEmailInput()).fill(env.senderEmail);
    await (await loginPage.getPasswordInput()).fill('WrongPassword999!');
    await (await loginPage.getSignInButton()).click();
    await expect(page).toHaveURL(/signin/);
  });

  test('empty form does not submit', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await (await loginPage.getSignInButton()).click();
   await expect(page).toHaveURL(/signin/);
  });

  test('invalid email format does not submit', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await (await loginPage.getEmailInput()).fill('notanemail');
    await (await loginPage.getPasswordInput()).fill(env.senderPassword);
    await (await loginPage.getSignInButton()).click();
   await expect(page).toHaveURL(/signin/);
  });

  test('protected route redirects unauthenticated user to signin', async ({ page }) => {
    await page.goto('/documents');
   await expect(page).toHaveURL(/signin/);
  });

  test('protected settings route redirects unauthenticated user to signin', async ({ page }) => {
    await page.goto('/settings/profile');
    await expect(page).toHaveURL(/signin/);
  });
});
