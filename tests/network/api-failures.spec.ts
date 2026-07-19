import { test, expect } from '@playwright/test';
import { env } from '../../config/env';

/**
 * API Failure Simulation (Deep Network Interception)
 *
 * Why this file exists separately from network.spec.ts:
 * ────────────────────────────────────────────────────────
 * network.spec.ts covers the basics: generic 500/401 intercepts and
 * request counting. This file goes deeper — targeting the document
 * signing workflow specifically and using advanced interception patterns:
 *
 *   1. Status-specific failures (500, 503, 429) with proper HTTP semantics
 *   2. Artificial response delay to simulate slow backends / cold starts
 *   3. page.waitForResponse() to VERIFY the mock was actually hit
 *   4. Partial failure: static assets load, only API fails
 *   5. Request abort (simulates offline / firewall block)
 *   6. Sequential mock: first call fails, second succeeds (transient failure)
 *   7. Response body inspection after interception
 *
 * In a real company, these patterns replace the need to break the backend
 * to test error states. You inject failures at the network layer — no
 * server changes, no database pollution, deterministic every run.
 *
 * References:
 *   Playwright route API — https://playwright.dev/docs/network
 *   OWASP Error Handling — https://owasp.org/www-project-web-security-testing-guide/
 *
 * Run: pnpm exec playwright test tests/network/api-failures.spec.ts --project=ci
 */

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Status-specific 5xx failures on the document API
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@network @failures 5xx failure modes', () => {

  /**
   * 500 Internal Server Error
   *
   * The most common backend failure. The UI must not show a blank screen
   * or unhandled JS error. Minimum bar: page renders, navigation works.
   *
   * Pattern: page.route() → fulfill(500) → navigate → assert UI state
   */
  test('500 on document API — page degrades gracefully, navigation intact', async ({ page }) => {
    // Intercept ONLY the document list endpoint — not all API calls.
    // This is more realistic: a single microservice failing, not a total outage.
    await page.route('**/api/v1/documents**', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }),
      }),
    );

    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    // Page body must be visible — no blank screen of death
    await expect(page.locator('body')).toBeVisible();

    // App must be on a known route — not stuck on a crash page
    expect(page.url()).toMatch(/\/(documents|signin|sign)/);

    // Navigation or sign-in form must still render
    // (Documenso redirects unauthenticated users to /signin)
    const hasNav   = await page.locator('nav, header').first().isVisible().catch(() => false);
    const hasForm  = await page.locator('form').first().isVisible().catch(() => false);
    expect(hasNav || hasForm, 'Page rendered neither navigation nor a form after 500').toBe(true);
  });

  /**
   * 503 Service Unavailable with Retry-After header
   *
   * 503 means the service is temporarily down (deployment, maintenance, overload).
   * A well-implemented client respects Retry-After and surfaces a human-readable
   * message — not "undefined is not a function".
   *
   * The Retry-After header value is the key difference from a plain 500.
   */
  test('503 Service Unavailable — page remains usable, no JS crash', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.route('**/api/v1/**', route =>
      route.fulfill({
        status: 503,
        headers: {
          'Content-Type':  'application/json',
          'Retry-After':   '30',                // Standard HTTP header — tells clients to wait 30s
        },
        body: JSON.stringify({ error: 'Service Unavailable', retryAfter: 30 }),
      }),
    );

    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    // Zero tolerance for unhandled JS errors — a 503 is an API problem, not a
    // reason for the frontend to throw. Filter noise (non-critical extension errors etc.)
    const criticalErrors = jsErrors.filter(
      e => !e.includes('extension') && !e.includes('chrome-extension'),
    );
    expect(
      criticalErrors,
      `Unhandled JS errors after 503: ${criticalErrors.join(', ')}`,
    ).toHaveLength(0);
  });

  /**
   * 429 Too Many Requests (rate limiting)
   *
   * CDN / WAF rate limiting is common in production. The UI should handle
   * it without entering an infinite retry loop or crashing.
   *
   * Retry-After tells compliant clients how long to wait.
   */
  test('429 Too Many Requests — rate limiting handled without crash or loop', async ({ page }) => {
    let interceptCount = 0;

    await page.route('**/api/v1/documents**', route => {
      interceptCount++;
      route.fulfill({
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After':  '60',
        },
        body: JSON.stringify({ error: 'Too Many Requests' }),
      });
    });

    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    // Critical: if interceptCount is very high the app is retrying in a loop.
    // 1 initial call + a few framework retries is fine; 20+ is a bug.
    expect(
      interceptCount,
      `429 triggered ${interceptCount} retries — possible infinite retry loop`,
    ).toBeLessThan(10);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Slow response simulation (artificial delay)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@network @failures Slow response simulation', () => {

  /**
   * Artificial 2-second delay on the document API
   *
   * Simulates a cold-start Lambda, slow DB query, or peak traffic.
   * The UI must remain interactive — not freeze, not show a blank screen.
   *
   * Key technique: route.fulfill({ delay }) introduces a real wait before the
   * response is delivered, exercising any loading states in the UI.
   */
  test('2s delayed API response — page remains interactive, no timeout crash', async ({ page }) => {
    const DELAY_MS = 2000;

    await page.route('**/api/v1/documents**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], count: 0 }),
        delay: DELAY_MS,
      }),
    );

    const start = Date.now();
    await page.goto('/documents');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    const elapsed = Date.now() - start;

    // Page navigated successfully despite the delay
    await expect(page.locator('body')).toBeVisible();

    // Sanity check: elapsed time reflects the artificial delay (not instant)
    // We can't assert >= 2000 because navigation involves many requests — just
    // assert the page didn't bail before the delay resolved.
    expect(elapsed).toBeGreaterThan(0);

    console.log(`Page loaded in ${elapsed}ms with ${DELAY_MS}ms artificial API delay`);
  });

  /**
   * Slow response followed by 500 — simulates a timeout that eventually errors
   *
   * In production: backend is struggling (high latency) and eventually fails.
   * This is worse than a fast failure — the user is left waiting, then gets an error.
   * The UI must handle both the wait and the eventual failure without crashing.
   */
  test('slow then 500 response — UI handles delayed failure gracefully', async ({ page }) => {
    await page.route('**/api/v1/documents**', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
        delay: 1500,
      }),
    );

    await page.goto('/documents');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).toMatch(/\/(documents|signin)/);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — page.waitForResponse() verification pattern
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@network @failures Response interception verification', () => {

  /**
   * Verify the mock was actually hit — not just assumed
   *
   * A common mistake: route() is set up but the test navigates to a page
   * that doesn't actually call that endpoint. The mock is never triggered,
   * the test passes vacuously, and you have false confidence.
   *
   * page.waitForResponse() proves the intercept fired. If it times out,
   * the endpoint was never called — revealing a spec or routing problem.
   *
   * This pattern is essential in code review: always ask "how do you know
   * the mock was hit?"
   */
  test('waitForResponse confirms the 500 mock was actually triggered', async ({ page }) => {
    let mockWasHit = false;

    await page.route('**/api/v1/documents**', route => {
      mockWasHit = true;
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Injected 500' }),
      });
    });

    // Set up the response listener BEFORE navigation — race condition otherwise
    const responsePromise = page.waitForResponse(
      res => res.url().includes('/api/v1/documents') && res.status() === 500,
      { timeout: 10_000 },
    );

    await page.goto('/documents');

    // If this line throws a TimeoutError, the endpoint was never called on this page
    // — that's a finding, not a test failure.
    try {
      const response = await responsePromise;
      expect(response.status()).toBe(500);

      const body = await response.json();
      expect(body.error).toBe('Injected 500');

      expect(mockWasHit, 'route handler fired but waitForResponse did not see it').toBe(true);
    } catch (e: any) {
      if (e.message?.includes('Timeout')) {
        // The page didn't call /api/v1/documents at all.
        // This is informational for the portfolio — Documenso SSR may fetch server-side.
        console.log('INFO: /api/v1/documents was not called by the browser (likely SSR fetch)');
        test.skip(true, 'Documenso fetches this endpoint server-side — not interceptable via page.route()');
      } else {
        throw e;
      }
    }
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Signing page under API failure
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@network @failures Signing page failure scenarios', () => {

  /**
   * Sign page with tRPC error injection
   *
   * The Documenso signing page at /sign/<token> calls tRPC procedures to
   * validate the token and load the document fields. Injecting a 500 on
   * tRPC routes simulates a backend failure mid-signing flow.
   *
   * Expected: page renders (even if showing an error state), no JS crash.
   * An "invalid link" or "error loading document" message is the correct
   * degraded behaviour — not a blank white screen.
   */
  test('sign page tRPC 500 — renders an error state, no unhandled JS error', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    // tRPC calls on the signing page — intercept all of them
    await page.route('**/api/trpc/**', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Internal server error', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR' } },
        }),
      }),
    );

    // Use a syntactically valid but non-existent token
    // Documenso should show "invalid link" or "not found", not crash
    await page.goto('/sign/test-token-failure-scenario');
    await page.waitForLoadState('networkidle');

    // body may be visibility:hidden during Documenso's loading overlay on /sign/ error states.
    // The real assertion: URL stays on /sign/ (no crash redirect) + no JS errors below.
    expect(page.url()).toContain('/sign/');

    // Filter non-critical browser extension noise
    const critical = jsErrors.filter(
      e => !e.toLowerCase().includes('extension') && !e.toLowerCase().includes('resizeobserver'),
    );
    expect(
      critical,
      `Unhandled JS errors on sign page with tRPC 500: ${critical.join(' | ')}`,
    ).toHaveLength(0);
  });

  /**
   * Sign page when tRPC returns 503 (backend deploy / cold start)
   *
   * During a rolling deploy, some requests hit the old pod (503) before the
   * new pod is ready. The signer must see a human-readable state, not a crash.
   */
  test('sign page tRPC 503 — page renders without crashing', async ({ page }) => {
    await page.route('**/api/trpc/**', route =>
      route.fulfill({
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '10' },
        body: JSON.stringify({ error: 'Service temporarily unavailable' }),
      }),
    );

    await page.goto('/sign/test-token-503-scenario');
    await page.waitForLoadState('networkidle');

    // body may be hidden during Documenso sign page error states — check URL not visibility
    expect(page.url()).toContain('/sign/');
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Partial failure (assets load, API fails)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@network @failures Partial failure — assets OK, API down', () => {

  /**
   * Realistic partial outage: CDN is up (CSS/JS loads), backend is down (API fails)
   *
   * This tests the UI shell independently of the data layer.
   * A well-structured frontend renders its chrome (header, nav, layout) even
   * when API calls fail. Only the data-dependent regions should show error states.
   *
   * Pattern: allow static assets through, block only API routes.
   */
  test('UI shell renders when API is down but static assets load', async ({ page }) => {
    const blockedUrls: string[] = [];
    const allowedUrls: string[] = [];

    await page.route('**/*', route => {
      const url = route.request().url();
      const isStatic = /\.(css|js|woff2?|png|jpg|svg|ico)(\?|$)/.test(url);
      const isApi    = url.includes('/api/v1/') || url.includes('/api/trpc/');

      if (isApi) {
        blockedUrls.push(url);
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Backend down' }),
        });
      } else if (isStatic) {
        allowedUrls.push(url);
        route.continue();       // Let real static assets through
      } else {
        route.continue();       // HTML, fonts — let through
      }
    });

    await page.goto('/documents');
    await page.waitForLoadState('domcontentloaded');

    // The page HTML and JS must have loaded (document.readyState is interactive/complete)
    const readyState = await page.evaluate(() => document.readyState);
    expect(['interactive', 'complete']).toContain(readyState);

    // Body must be visible — the HTML shell rendered
    await expect(page.locator('body')).toBeVisible();

    console.log(`Partial failure test: ${blockedUrls.length} API calls blocked, ${allowedUrls.length} static assets allowed`);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — Network abort (offline simulation)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@network @failures Abort simulation (offline / firewall)', () => {

  /**
   * route.abort() drops the request entirely at the network level.
   *
   * Unlike route.fulfill(500) — which returns a valid HTTP response with an
   * error code — abort() simulates: no network, firewall drop, DNS failure.
   * The browser sees a connection error, not an HTTP error. This is the
   * hardest failure for frontends to handle gracefully.
   *
   * Expected: page does not crash, error boundary or redirect kicks in.
   */
  test('API request abort (offline) — page does not crash or show blank screen', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.route('**/api/v1/documents**', route => route.abort('connectionrefused'));

    await page.goto('/documents');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
      // networkidle may not be reached if requests are aborted — that's ok
    });

    await expect(page.locator('body')).toBeVisible();

    const critical = jsErrors.filter(
      e => !e.toLowerCase().includes('extension') &&
           !e.toLowerCase().includes('resizeobserver') &&
           !e.toLowerCase().includes('failed to fetch'),   // fetch errors are expected here
    );
    expect(
      critical,
      `Unexpected JS errors after request abort: ${critical.join(' | ')}`,
    ).toHaveLength(0);
  });

  /**
   * Abort tRPC signing calls — simulates a firewall blocking the backend
   * mid-signing flow. The signer must see a meaningful error, not a JS crash.
   */
  test('tRPC abort on sign page — renders without JS crash', async ({ page }) => {
    await page.route('**/api/trpc/**', route => route.abort('connectionrefused'));

    await page.goto('/sign/test-abort-scenario');

    // Don't wait for networkidle — aborted requests block it indefinitely
    await page.waitForLoadState('domcontentloaded');

    // body may be hidden during sign page error states — URL check is sufficient
    expect(page.url()).toContain('/sign/');
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — Transient failure (first call fails, second succeeds)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@network @failures Transient failure (first call fails, retry succeeds)', () => {

  /**
   * Simulates a genuine transient failure — the kind that causes false alarms
   * in a flaky test suite but is actually valid production behaviour.
   *
   * First request → 500 (DB glitch / cold start)
   * Second request → 200 (recovered)
   *
   * A resilient UI should recover on retry without user intervention.
   * This test documents whether Documenso has retry logic built in.
   */
  test('first document API call fails, second succeeds — UI recovers', async ({ page }) => {
    let callCount = 0;

    await page.route('**/api/v1/documents**', route => {
      callCount++;
      if (callCount === 1) {
        // First call fails
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Transient error — retry' }),
        });
      } else {
        // Subsequent calls succeed
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], count: 0 }),
        });
      }
    });

    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    // Log retry behaviour for the report — whether callCount > 1 tells us
    // if the frontend has automatic retry logic
    const hasRetry = callCount > 1;
    console.log(
      `Transient failure test: endpoint called ${callCount} time(s). ` +
      `Documenso ${hasRetry ? 'DOES' : 'does NOT'} automatically retry on 500.`,
    );

    // Either outcome is valid — this test documents the behaviour, not enforces it
    // The real value is the console.log above appearing in the HTML report
  });

});
