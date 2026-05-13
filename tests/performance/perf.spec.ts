import { test, expect } from '@playwright/test';

/**
 * Performance Testing: Page Load Budgets
 *
 * Two measurement approaches:
 * 1. Wall-clock timing  — Date.now() before/after navigation (simple, CI-friendly)
 * 2. Navigation Timing API — browser's built-in precise metrics (professional)
 *
 * These test NON-FUNCTIONAL requirements. The app working correctly is
 * functional. The app working correctly AND fast is non-functional.
 * UK SDET job specs increasingly ask for both.
 *
 * Run: pnpm exec playwright test tests/performance/ --project=chromium
 */

// ── Time budgets (milliseconds) ──────────────────────────────────────────────
// Maximum acceptable times. Exceeding them fails the test — same as any
// functional assertion. Real companies define these in a perf budget document.
const BUDGETS = {
  signinPageLoad:    3000,   // signin page fully loaded
  dashboardPageLoad: 5000,   // dashboard (makes API calls) fully loaded
  domInteractive:    2500,   // DOM parsed — user can start interacting
  timeToFirstByte:   1000,   // server starts responding within 1 second
};

// ══════════════════════════════════════════════════════════════════════════════
// UNAUTHENTICATED PAGES
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@perf Performance — unauthenticated pages', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // ── Approach 1: Wall-clock ─────────────────────────────────────────────────
  test('signin page loads within budget (wall-clock)', async ({ page }) => {
    const start = Date.now();
    await page.goto('/signin');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;

    // Custom failure message tells you exactly how slow it was
    expect(elapsed, `Signin took ${elapsed}ms — budget is ${BUDGETS.signinPageLoad}ms`)
      .toBeLessThan(BUDGETS.signinPageLoad);
  });

  // ── Approach 2: Navigation Timing API ─────────────────────────────────────
  // The browser records precise timing internally. page.evaluate() lets us
  // read those numbers from inside the browser context.
  test('signin page — navigation timing within budgets', async ({ page }) => {
    await page.goto('/signin');
    await page.waitForLoadState('domcontentloaded');

    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType(
        'navigation'
      )[0] as PerformanceNavigationTiming;

      return {
        // Time from navigation start → DOM is interactive (buttons work)
        domInteractive:   Math.round(nav.domInteractive),
        // Time from navigation start → page fully loaded
        loadComplete:     Math.round(nav.loadEventEnd),
        // Time to First Byte — server response latency
        ttfb:             Math.round(nav.responseStart - nav.requestStart),
        // Total network time (DNS + TCP + TLS + server + transfer)
        totalNetworkTime: Math.round(nav.responseEnd - nav.startTime),
      };
    });

    // Log as a table — shows up in the Playwright HTML report
    console.table(timing);

    expect(timing.domInteractive, 'DOM interactive exceeded budget')
      .toBeLessThan(BUDGETS.domInteractive);

    expect(timing.ttfb, 'Time to first byte exceeded budget')
      .toBeLessThan(BUDGETS.timeToFirstByte);

    expect(timing.loadComplete, 'Page load exceeded budget')
      .toBeLessThan(BUDGETS.signinPageLoad);
  });

  test('signin page — repeated loads stay within budget', async ({ page }) => {
    // Run 3 times and assert every single run is within budget
    // Catches intermittent slowness that a single run might miss
    const times: number[] = [];

    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      await page.goto('/signin');
      await page.waitForLoadState('networkidle');
      times.push(Date.now() - start);
    }

    console.log('Load times (3 runs):', times.map(t => `${t}ms`).join(', '));

    for (const elapsed of times) {
      expect(elapsed, `One run took ${elapsed}ms — budget is ${BUDGETS.signinPageLoad}ms`)
        .toBeLessThan(BUDGETS.signinPageLoad);
    }
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATED PAGES
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@perf Performance — authenticated pages', () => {
  // storageState injected by chromium project (sender.json)

  test('documents dashboard loads within budget', async ({ page }) => {
    const start = Date.now();
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;

    expect(elapsed, `Dashboard took ${elapsed}ms — budget is ${BUDGETS.dashboardPageLoad}ms`)
      .toBeLessThan(BUDGETS.dashboardPageLoad);
  });

  test('documents dashboard — navigation timing within budgets', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType(
        'navigation'
      )[0] as PerformanceNavigationTiming;

      return {
        domInteractive:   Math.round(nav.domInteractive),
        loadComplete:     Math.round(nav.loadEventEnd),
        ttfb:             Math.round(nav.responseStart - nav.requestStart),
        totalNetworkTime: Math.round(nav.responseEnd - nav.startTime),
      };
    });

    console.table(timing);

    expect(timing.domInteractive, 'Dashboard DOM interactive exceeded budget')
      .toBeLessThan(BUDGETS.dashboardPageLoad);

    expect(timing.ttfb, 'Dashboard TTFB exceeded budget')
      .toBeLessThan(BUDGETS.timeToFirstByte);
  });

  test('settings profile page loads within budget', async ({ page }) => {
    const start = Date.now();
    await page.goto('/settings/profile');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;

    expect(elapsed, `Settings took ${elapsed}ms — budget is ${BUDGETS.dashboardPageLoad}ms`)
      .toBeLessThan(BUDGETS.dashboardPageLoad);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// IN-APP NAVIGATION
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@perf Performance — in-app navigation', () => {

  test('navigating from dashboard to settings is fast', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    const start = Date.now();
    await page.goto('/settings/profile');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;

    expect(elapsed, `Settings navigation took ${elapsed}ms`)
      .toBeLessThan(BUDGETS.dashboardPageLoad);
  });

});
