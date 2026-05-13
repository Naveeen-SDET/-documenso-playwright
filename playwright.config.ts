import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config();
export default defineConfig({
   globalTeardown: './tests/global-teardown.ts',
   testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  // ── Global screenshot comparison defaults ────────────────────────────────
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 150,
      threshold: 0.2,
      animations: 'disabled',
    },
  },

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: '**/setup/auth.setup.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox cross-browser — run explicitly: pnpm exec playwright test --project=firefox
{
  name: 'firefox',
  use: {
    ...devices['Desktop Firefox'],
    storageState: '.auth/sender.json',
  },
  dependencies: ['setup'],
  testIgnore: ['**/setup/**', '**/visual/**'],
},
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: '.auth/sender.json' },
      dependencies: ['setup'],
      testIgnore: ['**/setup/**', '**/visual/**'],
    },
    // CI project: runs without auth setup, skips tests that need pre-seeded accounts
    {
      name: 'ci',
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
      testIgnore: ['**/setup/**', '**/auth/logout.spec.ts', '**/documents/**', '**/visual/**'],
    },
    // Visual regression — run explicitly: pnpm exec playwright test --project=visual
    // First run: add --update-snapshots to create baselines
    {
      name: 'visual',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/sender.json',
        viewport: { width: 1280, height: 720 },
        launchOptions: { args: ['--force-device-scale-factor=1'] },
      },
      dependencies: ['setup'],
      testMatch: '**/visual/**',
    },
  ],
});
