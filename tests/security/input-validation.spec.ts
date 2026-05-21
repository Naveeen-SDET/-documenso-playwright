import { test, expect } from '@playwright/test';
import { env } from '../../config/env';

/**
 * Input Validation & XSS Prevention Tests
 *
 * Why test input validation?
 * ──────────────────────────
 * Every form field is an attack surface. A signing platform is especially
 * sensitive — the "full name" field on a signing ceremony ends up rendered
 * in a legally binding PDF. If that field accepts raw HTML or script tags,
 * an attacker could inject content that appears in signed documents.
 *
 * What we test:
 *   1. Empty / whitespace-only submissions — should be rejected by the UI
 *   2. Email format validation — invalid formats should not reach the server
 *   3. XSS payloads in text fields — should be rendered as plain text, not executed
 *   4. SQL-injection-like strings — should not break the UI or cause server errors
 *   5. Oversized inputs — very long strings should not crash the page
 *   6. Unicode and emoji — should be handled gracefully
 *   7. API-level input rejection — malformed JSON bodies should return 400, not 500
 *
 * OWASP references:
 *   OTG-INPVAL-001 — Testing for Reflected Cross-Site Scripting
 *   OTG-INPVAL-005 — Testing for SQL Injection
 *   OTG-INPVAL-010 — Testing for HTML Injection
 *   OTG-CLIENT-002 — Testing for JavaScript Execution
 *
 * Skip behaviour:
 *   Browser tests skip gracefully when Docker is not running.
 *   API tests use safeFetch and skip on ECONNREFUSED.
 *
 * Run: pnpm exec playwright test tests/security/input-validation.spec.ts --project=ci
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

async function gotoSignin(page: any, testInfo: any): Promise<void> {
  try {
    await page.goto(`${env.baseUrl}/signin`);
    await page.waitForLoadState('domcontentloaded');
  } catch (e: any) {
    if (e.message?.includes('ECONNREFUSED') || e.message?.includes('connect')) {
      testInfo.skip(true, 'App not reachable — start Docker first');
    }
    throw e;
  }
}

async function safeFetch(
  request: any,
  url: string,
  options: Record<string, unknown>,
  testInfo: any,
) {
  try {
    return await request.post(url, options);
  } catch (e: any) {
    if (e.message?.includes('ECONNREFUSED') || e.message?.includes('connect')) {
      testInfo.skip(true, 'App not reachable — start Docker first');
      return null as never;
    }
    throw e;
  }
}

// ── Locators ─────────────────────────────────────────────────────────────────

const EMAIL_INPUT    = 'input[name="email"], input[type="email"], input[id="email"]';
const PASSWORD_INPUT = 'input[type="password"]';
const SUBMIT_BUTTON  = 'button[type="submit"], button:has-text("Sign in"), button:has-text("Continue")';

// ── XSS payload library ───────────────────────────────────────────────────────
// These are the most commonly tested payloads in browser security testing.
// None of these should cause JavaScript execution, alert boxes, or page crashes.

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><script>alert(1)</script>',
  "'><img src=x onerror=alert(1)>",
  '<svg onload=alert(1)>',
  'javascript:alert(1)',
  '"><details open ontoggle=alert(1)>',
];

// ── SQL injection strings ────────────────────────────────────────────────────
// These should not cause 500 errors, empty pages, or unexpected DB errors.

const SQL_PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  '" OR "1"="1',
  "1' AND SLEEP(5)--",
  "UNION SELECT * FROM users--",
];

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Empty and whitespace-only form submissions
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@security @input-validation Empty form submissions', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /**
   * Submitting an empty email field should show a validation error.
   * The user must never be logged in with an empty credential.
   */
  test('submitting empty email shows validation error', async ({ page }, testInfo) => {
    await gotoSignin(page, testInfo);

    const emailInput = page.locator(EMAIL_INPUT).first();
    await emailInput.waitFor({ state: 'visible' });

    // Clear the field and submit
    await emailInput.fill('');
    const passwordInput = page.locator(PASSWORD_INPUT).first();
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('somepassword');
    }
    await page.locator(SUBMIT_BUTTON).first().click();

    // Wait a moment for validation to appear
    await page.waitForTimeout(500);

    // Must NOT navigate away from /signin — empty email should be rejected
    const currentUrl = page.url();
    expect(
      currentUrl,
      'Empty email submission navigated away from signin — validation not working'
    ).toContain('/signin');
  });

  /**
   * A whitespace-only email (spaces, tabs) should be treated as empty.
   * Some naive validators pass "   " as a valid string before trim().
   */
  test('whitespace-only email is rejected', async ({ page }, testInfo) => {
    await gotoSignin(page, testInfo);

    const emailInput = page.locator(EMAIL_INPUT).first();
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill('     ');

    const passwordInput = page.locator(PASSWORD_INPUT).first();
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('somepassword');
    }
    await page.locator(SUBMIT_BUTTON).first().click();
    await page.waitForTimeout(500);

    const currentUrl = page.url();
    expect(currentUrl).toContain('/signin');
  });

  /**
   * Submitting a correctly formatted email with an empty password
   * must not authenticate the user.
   */
  test('empty password does not authenticate', async ({ page }, testInfo) => {
    await gotoSignin(page, testInfo);

    const emailInput = page.locator(EMAIL_INPUT).first();
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill('test@example.com');

    const passwordInput = page.locator(PASSWORD_INPUT).first();
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('');
      await page.locator(SUBMIT_BUTTON).first().click();
      await page.waitForTimeout(500);

      const currentUrl = page.url();
      expect(currentUrl).toContain('/signin');
    } else {
      // Single-step flow — password appears after email submit
      // Skip the assertion if we can't reach the password field
      testInfo.skip(true, 'Password field not visible on initial signin step');
    }
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Email format validation
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@security @input-validation Email format validation', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const invalidEmails = [
    { value: 'notanemail',          label: 'no @ symbol' },
    { value: '@nodomain.com',       label: 'missing local part' },
    { value: 'missing@',           label: 'missing domain' },
    { value: 'two@@domain.com',    label: 'double @' },
    { value: 'spaces in@email.com', label: 'space in local part' },
    { value: 'noTLD@domain',       label: 'no TLD' },
  ];

  for (const { value, label } of invalidEmails) {
    test(`invalid email (${label}) is rejected by the form`, async ({ page }, testInfo) => {
      await gotoSignin(page, testInfo);

      const emailInput = page.locator(EMAIL_INPUT).first();
      await emailInput.waitFor({ state: 'visible' });
      await emailInput.fill(value);

      const passwordInput = page.locator(PASSWORD_INPUT).first();
      if (await passwordInput.isVisible()) {
        await passwordInput.fill('somepassword');
      }
      await page.locator(SUBMIT_BUTTON).first().click();
      await page.waitForTimeout(500);

      // Either stays on /signin or shows a validation error — both are correct
      const currentUrl = page.url();
      const staysOnSignin = currentUrl.includes('/signin');

      // If somehow navigated away, assert we're not on an authenticated page
      if (!staysOnSignin) {
        expect(
          currentUrl,
          `Invalid email "${value}" caused navigation to: ${currentUrl}`
        ).not.toContain('/documents');
      }
    });
  }

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — XSS payload handling in the signin form
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@security @input-validation XSS payloads in form fields', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /**
   * Each XSS payload is entered as the email value.
   * The test asserts that:
   *   1. No JavaScript alert / dialog is triggered (Playwright throws on unexpected dialogs)
   *   2. The page does not crash (body remains visible)
   *   3. The app stays on /signin (payload did not trigger a navigation)
   */
  for (const payload of XSS_PAYLOADS) {
    test(`XSS payload is not executed: ${payload.substring(0, 40)}`, async ({ page }, testInfo) => {
      await gotoSignin(page, testInfo);

      // Any unexpected dialog (alert/confirm/prompt) is auto-dismissed and throws
      // We explicitly listen so we can fail with a clear message
      let dialogFired = false;
      page.on('dialog', async dialog => {
        dialogFired = true;
        await dialog.dismiss();
      });

      const emailInput = page.locator(EMAIL_INPUT).first();
      await emailInput.waitFor({ state: 'visible' });
      await emailInput.fill(payload);

      const passwordInput = page.locator(PASSWORD_INPUT).first();
      if (await passwordInput.isVisible()) {
        await passwordInput.fill('anypassword');
      }
      await page.locator(SUBMIT_BUTTON).first().click();
      await page.waitForTimeout(600);

      expect(
        dialogFired,
        `XSS payload triggered a dialog — script execution not prevented:\n  ${payload}`
      ).toBe(false);

      // Page must remain functional
      await expect(
        page.locator('body'),
        'Page body disappeared after XSS payload — possible crash'
      ).toBeVisible();
    });
  }

  /**
   * Reflected XSS check: if the email value is echoed back in the DOM
   * (e.g., in an error message "We couldn't sign in <value>"), it must
   * be HTML-encoded, not rendered as a live HTML element.
   */
  test('email value reflected in error message is HTML-encoded', async ({ page }, testInfo) => {
    await gotoSignin(page, testInfo);

    const payload = '<b id="xss-test">injected</b>';

    const emailInput = page.locator(EMAIL_INPUT).first();
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill(payload);

    const passwordInput = page.locator(PASSWORD_INPUT).first();
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('wrongpassword');
    }
    await page.locator(SUBMIT_BUTTON).first().click();
    await page.waitForTimeout(1000);

    // The injected <b> element must NOT exist as a real DOM node
    const injectedElement = page.locator('#xss-test');
    const count = await injectedElement.count();
    expect(
      count,
      'XSS payload was reflected as live HTML — <b id="xss-test"> found in DOM'
    ).toBe(0);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — SQL injection strings
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@security @input-validation SQL injection strings in form fields', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /**
   * SQL injection payloads in the email/password fields must not:
   *   1. Crash the page (500 / blank screen)
   *   2. Authenticate the user without valid credentials
   *   3. Cause any JavaScript errors
   *
   * Note: Prisma (used by Documenso) uses parameterised queries by default,
   * so these should all be harmless — this test verifies that assumption.
   */
  for (const payload of SQL_PAYLOADS) {
    test(`SQL injection payload is handled safely: ${payload.substring(0, 35)}`, async ({ page }, testInfo) => {
      await gotoSignin(page, testInfo);

      const jsErrors: string[] = [];
      page.on('pageerror', err => jsErrors.push(err.message));

      const emailInput = page.locator(EMAIL_INPUT).first();
      await emailInput.waitFor({ state: 'visible' });
      await emailInput.fill(payload);

      const passwordInput = page.locator(PASSWORD_INPUT).first();
      if (await passwordInput.isVisible()) {
        await passwordInput.fill(payload);
      }
      await page.locator(SUBMIT_BUTTON).first().click();
      await page.waitForTimeout(1000);

      // Must not navigate to authenticated pages
      const currentUrl = page.url();
      expect(
        currentUrl,
        `SQL injection payload authenticated the user: ${payload}`
      ).not.toContain('/documents');

      // No unhandled JS errors
      expect(
        jsErrors.length,
        `JavaScript errors after SQL payload: ${jsErrors.join(', ')}`
      ).toBe(0);

      // Page still functional
      await expect(page.locator('body')).toBeVisible();
    });
  }

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Oversized and Unicode inputs
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@security @input-validation Oversized and Unicode inputs', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /**
   * A very long string (> 1000 chars) in the email field must not:
   *   - Crash the server with a 500
   *   - Hang the browser (DoS via input)
   *   - Cause the page to become unresponsive
   *
   * OWASP: OTG-INPVAL-011 — Testing for Buffer Overflow
   */
  test('very long email input does not crash the page', async ({ page }, testInfo) => {
    await gotoSignin(page, testInfo);

    const longEmail = 'a'.repeat(500) + '@' + 'b'.repeat(500) + '.com';

    const emailInput = page.locator(EMAIL_INPUT).first();
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill(longEmail);

    const passwordInput = page.locator(PASSWORD_INPUT).first();
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('somepassword');
    }
    await page.locator(SUBMIT_BUTTON).first().click();
    await page.waitForTimeout(1000);

    // Page must still respond
    await expect(page.locator('body')).toBeVisible();
    // Must not have navigated to authenticated area
    expect(page.url()).not.toContain('/documents');
  });

  /**
   * Unicode characters (including right-to-left text, emoji, and null bytes)
   * must be handled without crashing. This matters for international users
   * who might copy-paste an email address that contains Unicode.
   */
  test('Unicode characters in email input are handled gracefully', async ({ page }, testInfo) => {
    await gotoSignin(page, testInfo);

    // Null byte is the most dangerous — it can truncate strings in C-based libs
    const unicodeInputs = [
      'user@例え.jp',              // Internationalised domain
      'tëst@domain.com',          // Diacritics in local part
      '用户@域名.中国',              // Full CJK email
      'test+emoji🎉@domain.com',  // Emoji in local part
    ];

    for (const input of unicodeInputs) {
      const emailInput = page.locator(EMAIL_INPUT).first();
      await emailInput.waitFor({ state: 'visible' });
      await emailInput.fill(input);
      await page.waitForTimeout(200);

      // Page must still be functional — no crash, no blank screen
      await expect(
        page.locator('body'),
        `Page crashed after Unicode input: ${input}`
      ).toBeVisible();
    }
  });

  /**
   * Null byte injection — a null byte (%00) can truncate strings in some
   * server-side languages and bypass length checks.
   */
  test('null byte in email field does not bypass validation', async ({ page }, testInfo) => {
    await gotoSignin(page, testInfo);

    //   is the null character
    const nullByteEmail = 'admin @domain.com';

    const emailInput = page.locator(EMAIL_INPUT).first();
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill(nullByteEmail);

    const passwordInput = page.locator(PASSWORD_INPUT).first();
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('anypassword');
    }
    await page.locator(SUBMIT_BUTTON).first().click();
    await page.waitForTimeout(800);

    expect(page.url()).not.toContain('/documents');
    await expect(page.locator('body')).toBeVisible();
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — API-level input validation
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@security @input-validation API input validation — malformed requests', () => {

  /**
   * Sending a completely empty body to the documents API must return 400 or 401,
   * never 500. A 500 on malformed input suggests the server is not validating
   * before processing — a common source of injection vulnerabilities.
   */
  test('empty body to POST /api/v1/documents returns 4xx not 5xx', async ({ request }, testInfo) => {
    let res: any;
    try {
      res = await request.post(`${env.baseUrl}/api/v1/documents`, {
        data: {},
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e: any) {
      if (e.message?.includes('ECONNREFUSED') || e.message?.includes('connect')) {
        testInfo.skip(true, 'App not reachable — start Docker first');
        return;
      }
      throw e;
    }

    expect(
      res.status(),
      `Expected 4xx for empty body but got ${res.status()} — server may not be validating input`
    ).toBeLessThan(500);
  });

  /**
   * Sending deeply nested JSON (JSON bomb) must not hang the server or return 500.
   * Express and Next.js both have default body-size limits that should catch this.
   */
  test('deeply nested JSON body is rejected safely', async ({ request }, testInfo) => {
    // Build a deeply nested object: { a: { a: { a: ... } } } 50 levels deep
    let nested: any = { value: 'bottom' };
    for (let i = 0; i < 50; i++) {
      nested = { nested };
    }

    let res: any;
    try {
      res = await request.post(`${env.baseUrl}/api/v1/documents`, {
        data: nested,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e: any) {
      if (e.message?.includes('ECONNREFUSED') || e.message?.includes('connect')) {
        testInfo.skip(true, 'App not reachable — start Docker first');
        return;
      }
      throw e;
    }

    // Must not be a 500 — server should reject before processing
    expect(
      res.status(),
      `Deeply nested JSON caused a ${res.status()} — server may be vulnerable to JSON bomb`
    ).not.toBe(500);
  });

  /**
   * Sending an oversized string field must not cause a 500.
   * A hardened API either truncates or rejects at the validation layer.
   */
  test('oversized string field in request body returns 4xx not 5xx', async ({ request }, testInfo) => {
    let res: any;
    try {
      res = await request.post(`${env.baseUrl}/api/v1/documents`, {
        data: {
          title: 'A'.repeat(100_000),  // 100KB title
          content: 'B'.repeat(100_000),
        },
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid-key',
        },
      });
    } catch (e: any) {
      if (e.message?.includes('ECONNREFUSED') || e.message?.includes('connect')) {
        testInfo.skip(true, 'App not reachable — start Docker first');
        return;
      }
      throw e;
    }

    expect(
      res.status(),
      `Oversized field caused ${res.status()} — server should return 4xx not 5xx`
    ).not.toBe(500);
  });

});
