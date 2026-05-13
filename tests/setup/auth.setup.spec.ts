import { test } from '@playwright/test';
import { env } from '../../config/env';
import * as fs from 'fs';

test.use({ storageState: { cookies: [], origins: [] } });

async function login(page: any, email: string, password: string) {
  await page.goto('/signin');
  await page.waitForLoadState('networkidle');

  // Use name attribute as it's more stable than label association
  const emailInput = page.locator('input[name="email"], input[type="email"], input[id="email"]').first();
  await emailInput.waitFor({ state: 'visible' });
  await emailInput.fill(email);

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.waitFor({ state: 'visible' });
  await passwordInput.fill(password);

  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(url => !url.toString().includes('/signin'), { timeout: 30000 });
}

test('create sender auth', async ({ page }) => {
  if (!fs.existsSync('.auth')) fs.mkdirSync('.auth');
  await login(page, env.senderEmail, env.senderPassword);
  await page.context().storageState({ path: '.auth/sender.json' });
  console.log('✓ Sender auth saved');
});

test('create signer auth', async ({ page }) => {
  await login(page, env.signerEmail, env.signerPassword);
  await page.context().storageState({ path: '.auth/signer.json' });
  console.log('✓ Signer auth saved');
});
