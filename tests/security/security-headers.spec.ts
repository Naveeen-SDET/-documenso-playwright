import { test, expect } from '@playwright/test';
import { env } from '../../config/env';

/**
 * HTTP Security Headers Tests
 *
 * Why test HTTP headers?
 * ──────────────────────
 * HTTP response headers are the first line of browser-side defence. A missing
 * or misconfigured header can expose users to clickjacking, XSS, MIME sniffing,
 * and information disclosure — all listed in the OWASP Top 10 and OWASP Testing
 * Guide (OTG-CONFIG-007).
 *
 * These tests check that the Documenso app and API set the headers that modern
 * security standards require. They run on every nightly regression and flag
 * regressions before a security pen test does.
 *
 * References:
 *   OWASP Secure Headers Project — https://owasp.org/www-project-secure-headers/
 *   Mozilla Observatory              — https://observatory.mozilla.org/
 *   securityheaders.com              — https://securityheaders.com/
 *
 * Skip behaviour:
 *   All tests skip gracefully when Docker is not running (ECONNREFUSED).
 *
 * Run: pnpm exec playwright test tests/security/security-headers.spec.ts --project=ci
 */

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Fetch a URL, skip the test if the app is not reachable.
 * Returns null only when skipped — the test body never sees null.
 */
async function safeFetch(
  request: Parameters<typeof test>[1] extends (args: infer A) => unknown
    ? never
    : any,
  url: string,
  testInfo: any,
  options?: Record<string, unknown>,
) {
  try {
    return await request.get(url, options);
  } catch (e: any) {
    if (e.message?.includes('ECONNREFUSED') || e.message?.includes('connect')) {
      testInfo.skip(true, 'App not reachable — start Docker first');
      return null as never;
    }
    throw e;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — HTML page headers (UI routes)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@security @headers HTML pages — security headers', () => {

  /**
   * X-Content-Type-Options: nosniff
   *
   * Prevents browsers from MIME-sniffing a response away from the declared
   * content type. Without this, an attacker can upload a file with an .jpg
   * extension that is actually JavaScript, and the browser will execute it.
   *
   * OWASP: OTG-CONFIG-007 | Required value: nosniff
   */
  test('X-Content-Type-Options is set to nosniff', async ({ request }, testInfo) => {
    const res = await safeFetch(request, env.baseUrl, testInfo);
    const header = res.headers()['x-content-type-options'];
    expect(
      header,
      'Missing X-Content-Type-Options header — browsers may MIME-sniff responses'
    ).toBeTruthy();
    expect(header?.toLowerCase()).toBe('nosniff');
  });

  /**
   * X-Frame-Options or Content-Security-Policy: frame-ancestors
   *
   * Prevents the page from being embedded in an iframe on another origin —
   * the primary defence against clickjacking attacks.
   *
   * OWASP: OTG-CLIENT-009
   * Acceptable values: DENY | SAMEORIGIN | frame-ancestors directive in CSP
   */
  test('clickjacking protection header is present', async ({ request }, testInfo) => {
    const res = await safeFetch(request, env.baseUrl, testInfo);
    const headers = res.headers();

    const xfo = headers['x-frame-options'];
    const csp = headers['content-security-policy'];
    const hasFrameAncestors = csp?.includes('frame-ancestors');

    expect(
      xfo || hasFrameAncestors,
      'Neither X-Frame-Options nor CSP frame-ancestors is set — page is vulnerable to clickjacking'
    ).toBeTruthy();

    if (xfo) {
      expect(
        ['DENY', 'SAMEORIGIN'].includes(xfo.toUpperCase()),
        `X-Frame-Options has unexpected value: "${xfo}"`
      ).toBe(true);
    }
  });

  /**
   * Referrer-Policy
   *
   * Controls how much referrer information is included with requests.
   * Without this, navigating away from an authenticated page leaks the
   * full URL (including any tokens in query strings) to third-party servers.
   *
   * OWASP: OTG-INFO-002
   * Recommended: strict-origin-when-cross-origin | no-referrer | same-origin
   */
  test('Referrer-Policy header is present', async ({ request }, testInfo) => {
    const res = await safeFetch(request, env.baseUrl, testInfo);
    const header = res.headers()['referrer-policy'];

    expect(
      header,
      'Missing Referrer-Policy — URLs including auth tokens may leak to third parties'
    ).toBeTruthy();

    const safeValues = [
      'no-referrer',
      'no-referrer-when-downgrade',
      'same-origin',
      'strict-origin',
      'strict-origin-when-cross-origin',
    ];
    expect(
      safeValues.some(v => header?.toLowerCase().includes(v)),
      `Referrer-Policy "${header}" is not a recommended safe value`
    ).toBe(true);
  });

  /**
   * X-Powered-By absent
   *
   * Advertising the server technology (e.g. "Next.js", "Express") gives
   * attackers a free enumeration shortcut — they can target known CVEs for
   * that framework version directly.
   *
   * OWASP: OTG-INFO-002
   * Required: header must be absent
   */
  test('X-Powered-By header is not exposed', async ({ request }, testInfo) => {
    const res = await safeFetch(request, env.baseUrl, testInfo);
    const header = res.headers()['x-powered-by'];

    expect(
      header,
      `X-Powered-By is set to "${header}" — server technology is being disclosed`
    ).toBeUndefined();
  });

  /**
   * Server header absent or redacted
   *
   * A full "Server: nginx/1.18.0" header tells attackers the exact version,
   * making CVE lookups trivial.
   *
   * OWASP: OTG-INFO-002
   * Required: absent or generic (e.g. "nginx" with no version)
   */
  test('Server header does not expose version information', async ({ request }, testInfo) => {
    const res = await safeFetch(request, env.baseUrl, testInfo);
    const server = res.headers()['server'];

    if (server) {
      // If present, must not contain version numbers like "1.18.0"
      expect(
        /\d+\.\d+/.test(server),
        `Server header "${server}" exposes a version number`
      ).toBe(false);
    }
    // Absent is also acceptable — no assertion needed
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — API response headers
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@security @headers API responses — security headers', () => {

  /**
   * Content-Type on API responses
   *
   * API endpoints must return application/json with an explicit charset.
   * Without charset, some older browsers may attempt to detect the encoding,
   * potentially enabling charset-sniffing attacks.
   */
  test('API responses include Content-Type: application/json', async ({ request }, testInfo) => {
    const res = await safeFetch(
      request,
      `${env.baseUrl}/api/v1/documents`,
      testInfo,
    );
    const ct = res.headers()['content-type'];
    expect(ct, 'API response missing Content-Type header').toBeTruthy();
    expect(
      ct?.toLowerCase().includes('application/json'),
      `Expected application/json but got: "${ct}"`
    ).toBe(true);
  });

  /**
   * Cache-Control on authenticated API responses
   *
   * Authenticated API responses must not be cached by shared caches (proxies,
   * CDNs). Without Cache-Control: no-store, a user's documents could be served
   * to the next person who uses the same shared proxy.
   *
   * OWASP: OTG-AUTHN-006
   */
  test('authenticated API responses set Cache-Control: no-store', async ({ request }, testInfo) => {
    if (!env.hasApiKey) {
      testInfo.skip(true, 'Requires DOCUMENSO_API_KEY to test authenticated responses');
      return;
    }

    const res = await safeFetch(
      request,
      `${env.baseUrl}/api/v1/documents`,
      testInfo,
      { headers: { Authorization: `Bearer ${env.apiKey}` } },
    );

    const cc = res.headers()['cache-control'];
    expect(cc, 'Missing Cache-Control on authenticated API response').toBeTruthy();
    expect(
      cc?.toLowerCase().includes('no-store') || cc?.toLowerCase().includes('private'),
      `Cache-Control "${cc}" does not prevent caching of authenticated responses`
    ).toBe(true);
  });

  /**
   * X-Content-Type-Options on API responses
   *
   * Even JSON API endpoints need this header. Without it, if the API ever
   * returns attacker-controlled content in an error message, a browser could
   * misinterpret it as HTML and execute embedded scripts.
   */
  test('API responses set X-Content-Type-Options: nosniff', async ({ request }, testInfo) => {
    const res = await safeFetch(
      request,
      `${env.baseUrl}/api/v1/documents`,
      testInfo,
    );
    const header = res.headers()['x-content-type-options'];
    expect(header?.toLowerCase()).toBe('nosniff');
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Error response headers (no auth)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@security @headers Error responses — no information leakage', () => {

  /**
   * Error responses must not expose stack traces or internal paths.
   *
   * A 400/401 from the API should return a clean error message.
   * It must not contain file paths, line numbers, or framework internals
   * in the response body or headers.
   */
  test('unauthenticated 400 response does not expose stack trace in body', async ({ request }, testInfo) => {
    const res = await safeFetch(
      request,
      `${env.baseUrl}/api/v1/documents`,
      testInfo,
    );

    expect([400, 401, 403]).toContain(res.status());

    const text = await res.text();

    // Stack trace indicators
    expect(text, 'Response body contains "at Object."  — stack trace may be leaking').not.toContain('at Object.');
    expect(text, 'Response body contains "node_modules" — internal path may be leaking').not.toContain('node_modules');
    expect(text, 'Response body contains ".ts:" — TypeScript source path may be leaking').not.toMatch(/\.ts:\d+/);
  });

});
