import { test } from '@playwright/test';
import { env } from '../../config/env';
import * as fs from 'fs';

test.use({ storageState: { cookies: [], origins: [] } });

test('create sender auth', async ({ page }) => {
  if (!fs.existsSync('.auth')) fs.mkdirSync('.auth');
  await page.goto('/signin');
  await page.getByLabel(/email/i).fill(env.senderEmail);
  await page.locator('input[type="password"]').fill(env.senderPassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(url => !url.toString().includes('/signin'), { timeout: 30000 });
  await page.context().storageState({ path: '.auth/sender.json' });
  console.log('✓ Sender auth saved');
});

test('create signer auth', async ({ page }) => {
  await page.goto('/signin');
  // Wait for form to be interactive — acts as natural gap between sequential logins
  await page.locator('input[type="password"]').waitFor({ state: 'visible' });
  await page.getByLabel(/email/i).fill(env.signerEmail);
  await page.locator('input[type="password"]').fill(env.signerPassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(url => !url.toString().includes('/signin'), { timeout: 30000 });
  await page.context().storageState({ path: '.auth/signer.json' });
  console.log('✓ Signer auth saved');
});
