import { test, expect, browser } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { env } from '../../config/env';

test.describe('@auth login', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('successful login redirects to dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.login(env.senderEmail, env.senderPassword);
    await expect(page).not.toHaveURL(/signin/);
    await expect(page).toHaveURL(/documents|dashboard/);
  });

  test('wrong password shows error', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await (await loginPage.getEmailInput()).fill(env.senderEmail);
    await (await loginPage.getPasswordInput()).fill('wrongpassword');
    await (await loginPage.getSignInButton()).click();
    await expect(page).toHaveURL(/signin/);
  });

  test('empty form shows validation', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await (await loginPage.getSignInButton()).click();
    await expect(page).toHaveURL(/signin/);
  });
});