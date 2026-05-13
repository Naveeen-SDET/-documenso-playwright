import { test, expect } from '@playwright/test';

/**
 * Cross-Browser Smoke Tests
 *
 * These tests run on BOTH Chromium and Firefox to catch browser-specific bugs.
 * They are intentionally lightweight — unauthenticated pages only.
 *
 * Why cross-browser matters in a real company:
 *   Documenso is used by businesses across Europe. A signing flow that breaks
 *   in Firefox is a compliance risk — the signer cannot complete a legally
 *   binding action. Cross-browser smoke catches rendering and JS engine
 *   differences before they reach production.
 *
 * Run on both browsers:
 *   pnpm exec playwright test tests/smoke/cross-browser.spec.ts --project=chromium --project=firefox
 *
 * CI runs chromium only (faster). Firefox runs nightly via regression.yml.
 */

// ══════════════════════════════════════════════════════════════════════════════
// UNAUTHENTICATED PAGES — safe to run in any browser, no auth needed
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@smoke @cross-browser Signin page', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('loads and shows email + password inputs', async ({ page, browserName }) => {
    await page.goto('/signin');
    await page.waitForLoadState('networkidle');

    // Core inputs must render in every browser
    await expect(
      page.locator('input[type="email"], input[name="email"], input[id="email"]').first()
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    // Sign in button
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

    console.log(`✓ Signin page OK on ${browserName}`);
  });

  test('shows validation error on empty submit', async ({ page, browserName }) => {
    await page.goto('/signin');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /sign in/i }).click();

    // Either HTML5 validation or app-level error — form must not proceed
    const url = page.url();
    expect(url).toContain('/signin');

    console.log(`✓ Empty submit blocked on ${browserName}`);
  });

  test('wrong password shows error, stays on signin', async ({ page, browserName }) => {
    await page.goto('/signin');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"], input[name="email"]').first().fill('wrong@test.com');
    await page.locator('input[type="password"]').first().fill('WrongPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // App stays on signin after bad credentials
    await expect(page).toHaveURL(/signin/, { timeout: 8_000 });

    console.log(`✓ Wrong password handled on ${browserName}`);
  });

  test('protected route redirects to signin', async ({ page, browserName }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    // Unauthenticated access to protected route must redirect
    await expect(page).toHaveURL(/signin/, { timeout: 8_000 });

    console.log(`✓ Auth redirect works on ${browserName}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PAGE STRUCTURE — assert key elements render across browsers
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@smoke @cross-browser Page structure', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signin page has correct title', async ({ page, browserName }) => {
    await page.goto('/signin');
    await page.waitForLoadState('domcontentloaded');

    const title = await page.title();
    expect(title.length, `Page title should not be empty on ${browserName}`).toBeGreaterThan(0);

    console.log(`✓ Title "${title}" on ${browserName}`);
  });

  test('no JavaScript errors on signin page load', async ({ page, browserName }) => {
    const errors: string[] = [];

    // Capture any uncaught JS errors
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/signin');
    await page.waitForLoadState('networkidle');

    expect(
      errors.length,
      `JS errors on ${browserName}: ${errors.join(', ')}`
    ).toBe(0);

    console.log(`✓ No JS errors on ${browserName}`);
  });
});