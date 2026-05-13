import { chromium } from '@playwright/test';
import { env } from './config/env';
import * as fs from 'fs';

async function globalSetup() {
  if (!fs.existsSync('.auth')) fs.mkdirSync('.auth');
  
  const browser = await chromium.launch();

  // Save sender session
  const senderPage = await browser.newPage();
  await senderPage.goto(`${env.baseUrl}/signin`);
  await senderPage.getByLabel(/email/i).fill(env.senderEmail);
  await senderPage.locator('input[type="password"]').fill(env.senderPassword);
  await senderPage.getByRole('button', { name: /sign in/i }).click();
  await senderPage.waitForURL(url => !url.toString().includes('/signin'), { timeout: 15000 });
  await senderPage.context().storageState({ path: '.auth/sender.json' });
  await senderPage.close();

  // Save signer session
  const signerPage = await browser.newPage();
  await signerPage.goto(`${env.baseUrl}/signin`);
  await signerPage.getByLabel(/email/i).fill(env.signerEmail);
  await signerPage.locator('input[type="password"]').fill(env.signerPassword);
  await signerPage.getByRole('button', { name: /sign in/i }).click();
  await signerPage.waitForURL(url => !url.toString().includes('/signin'), { timeout: 15000 });
  await signerPage.context().storageState({ path: '.auth/signer.json' });
  await signerPage.close();

  await browser.close();
}

export default globalSetup;