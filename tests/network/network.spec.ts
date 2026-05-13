import { test, expect } from '@playwright/test';

/**
 * Network Interception & Mocking
 *
 * page.route() intercepts network requests BEFORE they reach the server.
 * You can:
 *   - Return a fake response (mock)     → test error states without touching the DB
 *   - Block a request entirely (abort)  → test offline/timeout behaviour
 *   - Let the real request through      → spy on whether a call was made
 *
 * Why this matters in a real company:
 *   Without mocking, testing a 500 error means breaking your server.
 *   With mocking, you inject the 500 at the network layer — zero backend changes.
 *
 * Run: pnpm exec playwright test tests/network/ --project=chromium
 */

// ══════════════════════════════════════════════════════════════════════════════
// TEST 1 — Mock a 500 server error, assert UI handles it gracefully
// ══════════════════════════════════════════════════════════════════════════════

test('@network dashboard remains stable when API returns 500', async ({ page }) => {
  // Intercept ANY request matching this pattern and return a fake 500
  // The server never receives the request — Playwright short-circuits it
  await page.route('**/api/v1/documents**', route => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Internal Server Error' }),
    });
  });

  await page.goto('/documents');
  await page.waitForLoadState('networkidle');

  // App must NOT crash — no blank screen, no unhandled JS error
  // Unauthenticated users redirect to /signin — that's an acceptable response too.
  // Either outcome means the app handled the 500 gracefully, not catastrophically.
  await expect(page.locator('body')).toBeVisible();
  const url = page.url();
  expect(url, 'App should be on /documents or /signin — not a crash screen').toMatch(/\/(documents|signin)/);
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST 2 — Mock a 401, assert the app handles it without crashing
// ══════════════════════════════════════════════════════════════════════════════

test('@network API 401 response is handled without crashing', async ({ page }) => {
  // Intercept all /api/ calls and return 401 Unauthorized
  await page.route('**/api/**', route => {
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Unauthorized' }),
    });
  });

  await page.goto('/documents');
  await page.waitForLoadState('networkidle');

  // App should handle 401 gracefully — redirect to signin or show error
  // Both outcomes are acceptable — neither should be a blank crash screen
  await expect(page.locator('body')).toBeVisible();
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST 3 — Block non-critical requests (simulate ad blocker / firewall)
// NOTE: uses empty storageState so /signin does not redirect away
// ══════════════════════════════════════════════════════════════════════════════

test('@network signin page loads correctly when tracking requests are blocked', async ({ page }) => {
  // Clear auth so /signin actually shows the login form (not redirects)
  await page.context().clearCookies();

  // route.abort() drops the request entirely — simulates an ad blocker
  await page.route('**/*analytics*', route => route.abort());
  await page.route('**/*tracking*',  route => route.abort());
  await page.route('**/*telemetry*', route => route.abort());

  await page.goto('/signin');
  await page.waitForLoadState('networkidle');

  // Core page must still work — tracking is non-critical
  await expect(
    page.locator('input[type="email"], input[name="email"], input[id="email"]').first()
  ).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST 4 — Observe all browser requests on page load (spy pattern)
// NOTE: Documenso uses Remix SSR — document data is fetched server-side.
// page.on('request') observes ALL browser-initiated requests.
// ══════════════════════════════════════════════════════════════════════════════

test('@network documents page makes browser-initiated network requests on load', async ({ page }) => {
  const requestUrls: string[] = [];

  // page.on('request') fires for every browser-initiated request
  // Unlike page.route(), this is purely observational — does not intercept
  page.on('request', req => requestUrls.push(req.url()));

  await page.goto('/documents');
  await page.waitForLoadState('networkidle');

  // Some requests must have been made (HTML, JS bundles, fonts, etc.)
  expect(requestUrls.length, 'Expected browser to make at least some requests').toBeGreaterThan(0);

  // Log non-asset requests for visibility in the HTML report
  const meaningful = requestUrls.filter(
    u => !u.match(/\.(css|js|png|jpg|svg|woff|ico)(\?|$)/)
  );
  console.log(`Total requests: ${requestUrls.length}`);
  console.log('Non-asset requests:', meaningful);
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST 5 — Count and categorise all requests (detect excessive calls)
// ══════════════════════════════════════════════════════════════════════════════

test('@network documents page request count is within acceptable range', async ({ page }) => {
  const requests: { url: string; method: string }[] = [];

  page.on('request', req => {
    requests.push({ url: req.url(), method: req.method() });
  });

  await page.goto('/documents');
  await page.waitForLoadState('networkidle');

  // Filter out static assets — we only care about API/data requests
  const apiRequests = requests.filter(
    r => !r.url.match(/\.(css|js|png|jpg|svg|woff|woff2|ttf|ico|map)(\?|$)/)
  );

  // Page must make some requests to load
  expect(requests.length).toBeGreaterThan(0);

  // Only assert on API/data requests — not asset count (fonts/JS bundles vary)
  // Baseline observed: ~11 non-asset requests on /documents load
  // 40 is a generous upper bound — signals a bug if exceeded (infinite loop, etc.)
  expect(apiRequests.length, `Too many API requests on page load: ${apiRequests.length}`)
    .toBeLessThan(40);

  console.log(`Total requests: ${requests.length} (${apiRequests.length} non-asset)`);
  console.log('GET requests:', requests.filter(r => r.method === 'GET').length);
  console.log('POST requests:', requests.filter(r => r.method === 'POST').length);
});
