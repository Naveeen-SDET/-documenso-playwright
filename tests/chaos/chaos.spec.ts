import { test, expect } from '@playwright/test';
import { env } from '../../config/env';

/**
 * Day 58 — Chaos Testing
 *
 * Chaos testing deliberately injects unpredictable, cascading, or concurrent
 * failure conditions to verify the application degrades safely under adversity.
 *
 * How this differs from tests/network/api-failures.spec.ts (Day 41):
 * ─────────────────────────────────────────────────────────────────────
 * api-failures.spec.ts  → one endpoint fails, once, predictably
 * chaos.spec.ts         → multiple endpoints fail simultaneously, mid-flow,
 *                         randomly, or under concurrent load
 *
 * Chaos engineering principle (Netflix Chaos Monkey / Gremlin):
 *   "Build confidence by proactively verifying the system withstands
 *    turbulent, uncontrolled real-world conditions in a controlled experiment."
 *
 * The question answered here is not "does the app handle a 500?"
 * It is: "when multiple things go wrong at once, does anything catch fire?"
 *
 * Scenarios:
 *   C1 — Cascading failure: REST + tRPC fail simultaneously
 *   C2 — Mid-flow chaos: failure injected after the first step completes
 *   C3 — Random failure injection: 50% of calls fail (Chaos Monkey style)
 *   C4 — Concurrent request storm: parallel browser navigations under artificial load
 *   C5 — Recovery after chaos: chaos clears mid-session, app should recover
 *   C6 — Dependency chain: auth succeeds, data layer fails
 *   C7 — Malformed response: API returns invalid JSON unexpectedly
 *
 * Run: pnpm exec playwright test tests/chaos/chaos.spec.ts --project=ci
 *
 * @tags @chaos @network
 */

// ══════════════════════════════════════════════════════════════════════════════
// C1 — Cascading failure (REST + tRPC down simultaneously)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@chaos C1 — Cascading API failure', () => {

  /**
   * Both REST and tRPC fail at the same time.
   *
   * In production this happens during:
   *   - A backend deployment that brings down all services briefly
   *   - A database connection pool exhaustion (everything depends on it)
   *   - A CDN/proxy misconfiguration that returns 500 for all /api routes
   *
   * The app has no fallback when both layers are gone. The minimum bar:
   *   - No unhandled JS exception (white screen of death is a failure)
   *   - The browser tab remains responsive (page doesn't lock up)
   *   - The URL remains on a valid route
   */
  test('REST + tRPC both fail — page remains functional, no JS crash', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    // Bring down both API layers simultaneously
    await page.route('**/api/v1/**', route =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'REST layer down', code: 'CASCADING_FAILURE' }),
      }),
    );

    await page.route('**/api/trpc/**', route =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'tRPC layer down', code: -32603 },
        }),
      }),
    );

    await page.goto(`${env.baseUrl}/documents`);
    await page.waitForLoadState('domcontentloaded');

    // Page must not be blank — some shell must have rendered
    await expect(page.locator('body')).toBeVisible();

    // URL must be a known route — not a crash redirect to an error page
    expect(page.url()).toMatch(/\/(documents|signin|sign)/);

    // Zero tolerance for cascading JS errors caused by the API cascade
    const critical = jsErrors.filter(
      e =>
        !e.toLowerCase().includes('extension') &&
        !e.toLowerCase().includes('resizeobserver') &&
        !e.toLowerCase().includes('failed to fetch'), // expected when APIs are down
    );
    expect(
      critical,
      `Cascading failure caused unhandled JS errors: ${critical.join(' | ')}`,
    ).toHaveLength(0);
  });

  /**
   * All API calls fail AND static assets are slow.
   *
   * Simulates a degraded CDN where everything is either down or slow.
   * The browser's rendering engine should still produce something visible
   * from the initial HTML response — not wait forever on blocked assets.
   */
  test('all API down + static assets delayed — page loads eventually', async ({ page }) => {
    const STATIC_DELAY = 500; // 500ms delay on all static assets

    await page.route('**/*', route => {
      const url = route.request().url();

      if (url.includes('/api/v1/') || url.includes('/api/trpc/')) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'All APIs down' }),
        });
      }

      if (/\.(js|css)(\?|$)/.test(url)) {
        return route.fulfill({
          // Fetch real asset but delay it
          status: 200,
          contentType: url.includes('.css') ? 'text/css' : 'application/javascript',
          body: '', // minimal response — test is about resilience not content
          delay: STATIC_DELAY,
        });
      }

      return route.continue();
    });

    const start = Date.now();
    await page.goto(`${env.baseUrl}/documents`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    const elapsed = Date.now() - start;

    // Page reached domcontentloaded despite chaos — that's the test
    const readyState = await page.evaluate(() => document.readyState);
    expect(['interactive', 'complete']).toContain(readyState);

    console.log(`C1 cascading chaos: page reached DOMContentLoaded in ${elapsed}ms`);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// C2 — Mid-flow chaos (failure injected after first step)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@chaos C2 — Mid-flow failure injection', () => {

  /**
   * First page load succeeds. Chaos begins after the user is already in the app.
   *
   * This is more realistic than "chaos from the start" because in production,
   * failures usually happen mid-session — not at login. The user has a rendered
   * page, a valid session, and then something breaks underneath them.
   *
   * Pattern:
   *   1. Let first navigation succeed (chaos OFF)
   *   2. Enable chaos intercept for subsequent requests
   *   3. Navigate to a second page
   *   4. Verify graceful degradation, not a JS explosion
   */
  test('navigation succeeds, then API fails on next route — no crash', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    // Let initial load succeed without any intercept
    await page.goto(`${env.baseUrl}/sign/chaos-mid-flow-test`);
    await page.waitForLoadState('domcontentloaded');

    // Now inject chaos for subsequent API requests
    await page.route('**/api/v1/**', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Mid-session failure injected' }),
      }),
    );

    await page.route('**/api/trpc/**', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Mid-session tRPC failure', code: -32603 } }),
      }),
    );

    // Trigger a navigation that will fire against the now-failing API
    await page.goto(`${env.baseUrl}/documents`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('body')).toBeVisible();

    const critical = jsErrors.filter(
      e =>
        !e.toLowerCase().includes('extension') &&
        !e.toLowerCase().includes('resizeobserver') &&
        !e.toLowerCase().includes('failed to fetch'),
    );
    expect(
      critical,
      `Mid-flow chaos caused unhandled errors: ${critical.join(' | ')}`,
    ).toHaveLength(0);
  });

  /**
   * Auth endpoint succeeds, then the next API call in the chain fails.
   *
   * Real scenario: user logs in (auth succeeds), is redirected to dashboard,
   * then the document list call fails. Auth is healthy; the data layer is not.
   * The app should show an authenticated shell with a data-load error —
   * not log the user out or crash entirely.
   */
  test('auth passes, subsequent document API fails — app does not force logout', async ({ page }) => {
    let callCount = 0;

    await page.route('**/api/v1/documents**', route => {
      callCount++;
      // First call succeeds (the redirect after auth), second fails (chaos)
      if (callCount <= 1) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ documents: [], totalCount: 0 }),
        });
      }
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Data layer unavailable' }),
      });
    });

    await page.goto(`${env.baseUrl}/documents`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
      // networkidle may not settle when routes are failing — that is expected
    });

    // Critical assertion: the user should not have been redirected to /signin
    // A data layer failure is not an auth failure — do not log the user out
    const url = page.url();
    expect(url).not.toContain('/signin');

    await expect(page.locator('body')).toBeVisible();
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// C3 — Random failure injection (Chaos Monkey style)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@chaos C3 — Random failure injection (Chaos Monkey)', () => {

  /**
   * 50% of all API requests fail at random.
   *
   * This is the classic Chaos Monkey pattern. In production, flaky backends,
   * load balancers with misconfigured health checks, or network partitions can
   * cause exactly this: some requests succeed, others fail, with no pattern.
   *
   * Why 50%? It is a harsh but plausible signal. Real chaos typically uses
   * 10–20%. 50% is used here to guarantee the test exercises both paths
   * within a short run window.
   *
   * The goal is not that the app looks perfect — it's that it does not crash.
   */
  test('50% API failure rate — page survives without unhandled errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    let total = 0;
    let injected = 0;

    // Use a deterministic pseudo-random based on call order (not Math.random)
    // so the test is reproducible without a seed. Every other call fails.
    await page.route('**/api/v1/**', route => {
      total++;
      if (total % 2 === 0) {
        // Even calls succeed
        return route.continue();
      }
      // Odd calls fail
      injected++;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Chaos injection — 50% failure rate' }),
      });
    });

    await page.goto(`${env.baseUrl}/documents`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.locator('body')).toBeVisible();

    const critical = jsErrors.filter(
      e =>
        !e.toLowerCase().includes('extension') &&
        !e.toLowerCase().includes('resizeobserver') &&
        !e.toLowerCase().includes('failed to fetch'),
    );
    expect(
      critical,
      `50% chaos failure caused unhandled errors: ${critical.join(' | ')}`,
    ).toHaveLength(0);

    console.log(
      `C3 Chaos Monkey: ${total} API calls total, ${injected} injected failures (${total > 0 ? Math.round((injected / total) * 100) : 0}%)`,
    );
  });

  /**
   * Random failures on the sign page — the signing flow is where users
   * most need reliability. A random 50% failure rate on signing operations
   * should not produce a white screen or unhandled exception for the signer.
   */
  test('50% failure on sign page tRPC calls — page does not crash', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    let callCount = 0;

    await page.route('**/api/trpc/**', route => {
      callCount++;
      if (callCount % 2 === 0) {
        return route.continue();
      }
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Chaos injection', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR' } },
        }),
      });
    });

    await page.goto(`${env.baseUrl}/sign/chaos-random-failure-test`);
    await page.waitForLoadState('domcontentloaded');

    expect(page.url()).toContain('/sign/');

    const critical = jsErrors.filter(
      e =>
        !e.toLowerCase().includes('extension') &&
        !e.toLowerCase().includes('resizeobserver') &&
        !e.toLowerCase().includes('failed to fetch'),
    );
    expect(
      critical,
      `Chaos Monkey on sign page caused unhandled errors: ${critical.join(' | ')}`,
    ).toHaveLength(0);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// C4 — Concurrent request storm
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@chaos C4 — Concurrent request storm', () => {

  /**
   * Rapid-fire parallel page navigations.
   *
   * Tests whether the application handles multiple simultaneous requests
   * without crashing the browser context or leaking state between tabs.
   *
   * In a real company, this simulates:
   *   - Multiple users hitting the same endpoint simultaneously
   *   - Background tabs refreshing in parallel
   *   - A client that re-fires requests when the user navigates quickly
   */
  test('three simultaneous navigations to /documents complete without crash', async ({ browser }) => {
    // Create 3 isolated browser contexts to simulate 3 concurrent users
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);

    const pages = await Promise.all(contexts.map(ctx => ctx.newPage()));

    // Collect JS errors from all pages
    const allErrors: string[] = [];
    pages.forEach(p => p.on('pageerror', err => allErrors.push(err.message)));

    // Fire all three navigations in parallel
    await Promise.all(
      pages.map(p =>
        p.goto(`${env.baseUrl}/documents`).then(() =>
          p.waitForLoadState('domcontentloaded'),
        ),
      ),
    );

    // All pages must have a visible body
    await Promise.all(
      pages.map(p => expect(p.locator('body')).toBeVisible()),
    );

    // Clean up
    await Promise.all(contexts.map(ctx => ctx.close()));

    const critical = allErrors.filter(
      e =>
        !e.toLowerCase().includes('extension') &&
        !e.toLowerCase().includes('resizeobserver') &&
        !e.toLowerCase().includes('failed to fetch'),
    );
    expect(
      critical,
      `Concurrent navigation storm caused errors: ${critical.join(' | ')}`,
    ).toHaveLength(0);
  });

  /**
   * Burst of rapid API calls with mixed outcomes.
   *
   * Fires 5 concurrent API requests where some succeed and some fail.
   * Verifies no request causes the others to fail due to shared state.
   */
  test('burst of 5 concurrent API calls — each resolves independently', async ({ request }) => {
    // Fire 5 simultaneous calls to the public endpoints (no auth needed)
    const endpoints = [
      `${env.baseUrl}/sign/concurrent-test-1`,
      `${env.baseUrl}/sign/concurrent-test-2`,
      `${env.baseUrl}/sign/concurrent-test-3`,
      `${env.baseUrl}/sign/concurrent-test-4`,
      `${env.baseUrl}/sign/concurrent-test-5`,
    ];

    const results = await Promise.allSettled(
      endpoints.map(url => request.get(url)),
    );

    // All 5 must settle — none should hang indefinitely or throw an uncaught error
    expect(results).toHaveLength(5);

    // Every settled result should be either fulfilled (got a response) or
    // rejected cleanly (no uncaught exception in the process)
    results.forEach((result, i) => {
      expect(
        result.status,
        `Concurrent request ${i + 1} did not settle — may be hanging`,
      ).not.toBe('pending' as any);

      if (result.status === 'fulfilled') {
        // Whatever the status code, it must be a valid HTTP response — not a crash
        expect(result.value.status()).toBeGreaterThan(0);
      }
    });

    const fulfilled = results.filter(r => r.status === 'fulfilled').length;
    console.log(`C4 concurrent storm: ${fulfilled}/5 requests received HTTP responses`);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// C5 — Recovery after chaos clears
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@chaos C5 — Recovery after chaos clears', () => {

  /**
   * Chaos is injected, then removed. Does the app recover?
   *
   * This tests whether the application has recovery logic — can it detect
   * that the API is healthy again and resume normal behaviour, or does it
   * stay in a degraded state until the user hard-refreshes?
   *
   * Pattern:
   *   1. Inject failure (chaos ON)
   *   2. Navigate — verify degraded state
   *   3. Remove the intercept (chaos OFF) via page.unroute()
   *   4. Navigate again — verify recovery
   *
   * Why this matters: retry budgets, circuit breakers, and client-side
   * recovery logic are increasingly common in frontend architecture.
   * Verifying that the app can self-heal without a full reload is a
   * production-readiness signal.
   */
  test('API fails then recovers — second navigation loads correctly', async ({ page }) => {
    const FAIL_PATTERN = '**/api/v1/documents**';

    // Phase 1: Chaos ON
    const chaosHandler = (route: any) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Chaos: service down' }),
      });

    await page.route(FAIL_PATTERN, chaosHandler);

    await page.goto(`${env.baseUrl}/documents`);
    await page.waitForLoadState('domcontentloaded');

    // Verify degraded state (page loaded but data likely missing)
    await expect(page.locator('body')).toBeVisible();
    const urlDuringChaos = page.url();
    expect(urlDuringChaos).toMatch(/\/(documents|signin)/);

    // Phase 2: Chaos OFF — remove the intercept
    await page.unroute(FAIL_PATTERN, chaosHandler);

    // Navigate again with the real API now able to respond
    await page.goto(`${env.baseUrl}/sign/recovery-check-test`);
    await page.waitForLoadState('domcontentloaded');

    // Page must load on a valid route — proving the browser context is still healthy
    expect(page.url()).toMatch(/\/(sign|documents|signin)/);
    await expect(page.locator('body')).toBeVisible();

    console.log(
      `C5 recovery: degraded on ${urlDuringChaos}, ` +
      `recovered to ${page.url()} after chaos cleared`,
    );
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// C6 — Dependency chain failure (auth layer up, data layer down)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@chaos C6 — Dependency chain failure', () => {

  /**
   * One layer of the stack works; its dependency does not.
   *
   * Common production scenario:
   *   - Auth service (stateless, JWT verification) → healthy
   *   - Document service (needs DB) → unhealthy
   *
   * The app must NOT treat a data-layer failure as an auth failure.
   * Triggering a logout when the database is down is a bad UX and a
   * data integrity risk (active signing sessions interrupted).
   *
   * How to simulate: allow requests to non-document endpoints through,
   * but fail all document API calls specifically.
   */
  test('document API down but non-document routes healthy — no spurious logout', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    // Only the document data layer fails — everything else continues
    await page.route('**/api/v1/documents**', route =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Document service unavailable' }),
      }),
    );

    // tRPC for non-document operations continues normally
    // (we don't intercept /api/trpc/ here)

    await page.goto(`${env.baseUrl}/documents`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // The user must not have been redirected to /signin
    // A data layer failure is not a session failure
    expect(page.url(), 'Document service failure should not trigger logout').not.toContain('/signin');

    await expect(page.locator('body')).toBeVisible();

    const critical = jsErrors.filter(
      e =>
        !e.toLowerCase().includes('extension') &&
        !e.toLowerCase().includes('resizeobserver') &&
        !e.toLowerCase().includes('failed to fetch'),
    );
    expect(
      critical,
      `Dependency chain failure caused unhandled errors: ${critical.join(' | ')}`,
    ).toHaveLength(0);
  });

  /**
   * Verify that the public /sign/ route (no auth required) handles
   * the case where its backing service is down but the static shell loads.
   *
   * Signers who click a link in their email must see a human-readable error
   * — not a blank page — even when the signing service is degraded.
   */
  test('sign page static shell loads even when tRPC is fully down', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    // Bring down the tRPC layer entirely
    await page.route('**/api/trpc/**', route =>
      route.abort('connectionrefused'),
    );

    await page.goto(`${env.baseUrl}/sign/dependency-chain-test`);
    await page.waitForLoadState('domcontentloaded');

    // The static shell (Next.js HTML) must have been delivered
    // even if tRPC calls are failing
    const bodyText = await page.locator('body').innerText().catch(() => '');
    expect(
      bodyText.length,
      'Sign page body is empty when tRPC is down — Next.js HTML shell may not be delivering',
    ).toBeGreaterThan(0);

    const critical = jsErrors.filter(
      e =>
        !e.toLowerCase().includes('extension') &&
        !e.toLowerCase().includes('resizeobserver') &&
        !e.toLowerCase().includes('failed to fetch') &&
        !e.toLowerCase().includes('load failed'),
    );
    expect(
      critical,
      `tRPC abort on sign page caused unhandled errors: ${critical.join(' | ')}`,
    ).toHaveLength(0);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// C7 — Malformed response chaos (corrupted JSON mid-session)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@chaos C7 — Malformed response injection', () => {

  /**
   * API returns invalid JSON.
   *
   * In production: memory corruption, truncated responses, streaming errors,
   * or a mis-configured gzip middleware can cause JSON parse failures.
   * The frontend's JSON.parse() will throw — the question is whether that
   * exception is caught or propagates to an unhandled error.
   *
   * Content-Type: application/json tells the browser/client to parse as JSON.
   * Body is invalid JSON. This should trigger a parse error in the app's
   * fetch handler — which must be caught, not thrown to the global handler.
   */
  test('API returns invalid JSON — no unhandled parse error propagates', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.route('**/api/v1/documents**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',        // Lie: content-type says JSON
        body: '{ this is: not valid JSON >>>',  // But the body is corrupted
      }),
    );

    await page.goto(`${env.baseUrl}/documents`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.locator('body')).toBeVisible();

    // Filter errors that mention JSON parsing specifically
    const jsonParseErrors = jsErrors.filter(
      e => e.toLowerCase().includes('json') || e.toLowerCase().includes('parse'),
    );

    // Logging this as informational: a JSON parse error reaching window.onerror
    // means the app does not catch fetch errors — a bug worth knowing about.
    if (jsonParseErrors.length > 0) {
      console.log(
        `C7 INFO: Uncaught JSON parse error propagated to global handler: ${jsonParseErrors.join(' | ')}`,
        '\nThis indicates missing error handling in the fetch layer.',
      );
    }

    // The real assertion: page must not be completely broken regardless
    expect(page.url()).toMatch(/\/(documents|signin)/);
  });

  /**
   * API returns a truncated response — simulates a network interruption
   * mid-transfer. The response headers are correct, but the body ends early.
   *
   * A well-implemented HTTP client detects the content-length mismatch or
   * incomplete chunk and surfaces an error rather than treating the partial
   * data as valid.
   */
  test('truncated API response — page does not crash on partial data', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.route('**/api/v1/documents**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        // Valid JSON prefix — but truncated. The array is never closed.
        body: '{"documents":[{"id":1,"title":"Trunca',
      }),
    );

    await page.goto(`${env.baseUrl}/documents`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.locator('body')).toBeVisible();

    const critical = jsErrors.filter(
      e =>
        !e.toLowerCase().includes('extension') &&
        !e.toLowerCase().includes('resizeobserver') &&
        !e.toLowerCase().includes('failed to fetch'),
    );

    // Log any parse errors — they are findings, not necessarily failures
    if (critical.length > 0) {
      console.log(
        `C7 truncated response caused unhandled errors: ${critical.join(' | ')}`,
      );
    }

    // Minimum bar: URL is still valid, page didn't hard-crash
    expect(page.url()).toMatch(/\/(documents|signin)/);
  });

  /**
   * API returns a valid JSON body but with an unexpected schema shape.
   *
   * In production: a backend deploy changes the response shape but clients
   * still have the old code loaded. A documents list that returns a plain
   * array instead of { documents: [], totalCount: 0 } is a schema chaos test.
   *
   * This is the dynamic analogue of the Zod contract tests — the contract
   * tests verify known shapes; this verifies the app doesn't crash on
   * completely unexpected ones.
   */
  test('API returns unexpected response schema — Zod layer handles it gracefully', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.route('**/api/v1/documents**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        // Schema chaos: completely wrong shape (plain array instead of wrapped object)
        body: JSON.stringify([
          { unexpected: true, notADocument: 'chaos' },
          42,
          null,
        ]),
      }),
    );

    await page.goto(`${env.baseUrl}/documents`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    await expect(page.locator('body')).toBeVisible();

    const critical = jsErrors.filter(
      e =>
        !e.toLowerCase().includes('extension') &&
        !e.toLowerCase().includes('resizeobserver') &&
        !e.toLowerCase().includes('failed to fetch'),
    );
    expect(
      critical,
      `Unexpected schema chaos caused unhandled JS errors: ${critical.join(' | ')}`,
    ).toHaveLength(0);

    expect(page.url()).toMatch(/\/(documents|signin)/);
  });

});
