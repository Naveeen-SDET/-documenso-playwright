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
    ['./reporters/markdown-summary.reporter.ts', { outputFile: 'test-results/summary.md' }],
    ['./reporters/flaky-detector.reporter.ts',   { outputFile: 'test-results/flaky-tests.json' }],
    ['allure-playwright', {
      detail: true,
      outputFolder: 'allure-results',
      suiteTitle: true,
      // Links test tags (@security, @api etc.) to Allure labels automatically
      environmentInfo: {
        APP:        'Documenso',
        BASE_URL:   process.env.BASE_URL ?? 'http://localhost:3000',
        TEST_ENV:   process.env.TEST_ENV ?? 'local',
        NODE_ENV:   process.env.NODE_ENV ?? 'development',
        CI:         process.env.CI ?? 'false',
      },
    }],
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
    //
    // No `dependencies: ['setup']` here on purpose. The only spec run under this
    // project in CI (tests/smoke/cross-browser.spec.ts) overrides storageState to
    // an empty context per describe block — it never reads .auth/sender.json.
    // Declaring a dependency on 'setup' anyway forced Playwright to run the UI
    // login flow (auth.setup.spec.ts) before every firefox run; if that login
    // hiccuped for any reason (slow Docker warm-up, selector timing), the whole
    // firefox project was reported as failed even though the actual tests never
    // needed auth. Removing the dependency removes that single point of failure.
    // If a firefox spec ever needs auth, set storageState explicitly inside that
    // spec file (or add the dependency back for that project) rather than here.
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: '.auth/sender.json',
      },
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
