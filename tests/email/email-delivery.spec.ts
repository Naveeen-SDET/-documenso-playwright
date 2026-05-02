import { test, expect } from '@playwright/test';
import { waitForEmail, extractUrls } from '../helpers/inbucket';
import { env } from '../../config/env';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('@email email delivery', () => {
  test.beforeEach(({}, testInfo) => {
    testInfo.skip(!!process.env.CI, 'Requires Inbucket — run locally');
  });

  test('password reset email is delivered to Inbucket', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel(/email/i).fill(env.signerEmail);
  await page.getByRole('button', { name: /send|reset|submit/i }).click();

  // waitForEmail IS the assertion — times out if email never arrives
  const email = await waitForEmail(
    env.signerEmail,
    msg => /reset|password/i.test(msg.subject)
  );

  expect(email.subject).toMatch(/reset|password/i);

  const body = email.body.text || email.body.html;
  const links = extractUrls(body);
  const resetLink = links.find(l => l.includes('reset') || l.includes('forgot'));
  expect(resetLink).toBeDefined();
});
  test('reset link navigates to a valid page', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel(/email/i).fill(env.signerEmail);
    await page.getByRole('button', { name: /send|reset|submit/i }).click();

    const email = await waitForEmail(
      env.signerEmail,
      msg => /reset|password/i.test(msg.subject)
    );

    const body = email.body.text || email.body.html;
    const links = extractUrls(body);
    const resetLink = links.find(l => l.includes('reset') || l.includes('forgot'));
    expect(resetLink).toBeDefined();

    await page.goto(resetLink!);
    await expect(
      page.getByRole('heading', { name: /reset|new password/i })
    ).toBeVisible({ timeout: 10000 });
  });
});