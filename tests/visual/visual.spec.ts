import { test, expect, type Page } from '@playwright/test';

/**
 * Visual Regression Testing
 *
 * Strategy
 * ─────────
 * • First run with --update-snapshots creates the golden baseline .png files
 * • Every subsequent run diffs against those baselines pixel-by-pixel
 * • Dynamic content (timestamps, avatars, email addresses) is masked so
 *   data changes never cause false failures
 * • Animations are disabled for deterministic renders
 * • Tests tagged @visual — run with: pnpm exec playwright test --project=visual
 *
 * Masking approach
 * ─────────────────
 * We mask anything that changes between runs: relative times ("3 mins ago"),
 * avatar initials, and the user email in the settings form.
 * Masked regions render as solid magenta in the diff — easy to spot.
 *
 * Updating baselines
 * ───────────────────
 * If the UI intentionally changes, regenerate baselines:
 *   pnpm exec playwright test --project=visual --update-snapshots
 */

// ── Shared mask helpers ──────────────────────────────────────────────────────

/**
 * Collect locators for content that changes every run.
 * Pass the array to toHaveScreenshot({ mask: [...] }).
 */
function dynamicMasks(page: Page) {
  return [
    // Relative timestamps ("2 minutes ago", "Yesterday")
    page.locator('time'),
    page.locator('[class*="relative"]').filter({ hasText: /ago|yesterday|just now/i }),
    // User avatar circles (initials or profile photo)
    page.locator('[class*="avatar"]'),
    page.locator('[data-testid*="avatar"]'),
    page.locator('[aria-label*="avatar"]'),
    // Email addresses inside form inputs (personal data)
    page.locator('input[type="email"]'),
  ];
}

// ── Screenshot options ───────────────────────────────────────────────────────

const FULL_PAGE_OPTS = {
  fullPage: true,
  animations: 'disabled' as const,
  maxDiffPixels: 200,   // allow minor anti-aliasing differences across OS/GPU
};

const COMPONENT_OPTS = {
  animations: 'disabled' as const,
  maxDiffPixels: 50,
};

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('@visual Visual Regression — Unauthenticated pages', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signin page — full page snapshot', async ({ page }) => {
    await page.goto('/signin');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('signin-full-page.png', FULL_PAGE_OPTS);
  });

  test('signin page — form component snapshot', async ({ page }) => {
    await page.goto('/signin');
    await page.waitForLoadState('networkidle');

    // Capture just the form card rather than the whole viewport
    // Isolates the component from background/layout changes
    const formCard = page
      .locator('form, [data-testid="signin-form"], .card, main')
      .first();
    await formCard.waitFor({ state: 'visible' });

    await expect(formCard).toHaveScreenshot('signin-form-component.png', COMPONENT_OPTS);
  });

  test('signin page — error state after wrong password', async ({ page }) => {
    await page.goto('/signin');
    await page.waitForLoadState('networkidle');

    // Trigger the inline error message
    await page.locator('input[type="email"], input[name="email"], input[id="email"]').first().fill('wrong@example.com');
    await page.locator('input[type="password"]').first().fill('BadPassword999!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for either an error alert or URL stays on /signin
    await page.waitForTimeout(1500); // let error animate in
    await expect(page).toHaveURL(/signin/);

    await expect(page).toHaveScreenshot('signin-error-state.png', {
      ...FULL_PAGE_OPTS,
      maxDiffPixels: 300, // error message text may vary slightly
    });
  });
});

test.describe('@visual Visual Regression — Authenticated pages', () => {
  // Uses .auth/sender.json injected by the visual project in playwright.config.ts

  test('documents dashboard — full page snapshot', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('documents-dashboard.png', {
      ...FULL_PAGE_OPTS,
      mask: dynamicMasks(page),
    });
  });

  test('documents dashboard — pending filter', async ({ page }) => {
    await page.goto('/documents?status=PENDING');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('documents-pending-tab.png', {
      ...FULL_PAGE_OPTS,
      mask: dynamicMasks(page),
    });
  });

  test('settings profile page — full page snapshot', async ({ page }) => {
    await page.goto('/settings/profile');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('settings-profile.png', {
      ...FULL_PAGE_OPTS,
      mask: dynamicMasks(page),
    });
  });

  test('settings security page — full page snapshot', async ({ page }) => {
    await page.goto('/settings/security');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('settings-security.png', {
      ...FULL_PAGE_OPTS,
      mask: dynamicMasks(page),
    });
  });
});

test.describe('@visual Visual Regression — Viewport responsiveness', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signin page renders correctly at mobile width (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone 14 Pro
    await page.goto('/signin');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('signin-mobile-375.png', FULL_PAGE_OPTS);
  });

  test('signin page renders correctly at tablet width (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto('/signin');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('signin-tablet-768.png', FULL_PAGE_OPTS);
  });
});
