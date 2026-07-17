/**
 * Parametrized Authentication Tests — Day 62
 *
 * What is data-driven (parametrized) testing?
 * ────────────────────────────────────────────
 * Instead of writing one test per input, you write the test ONCE and give
 * it a table of inputs to run against. Playwright sees them as separate
 * tests — each gets its own result, its own retry, its own failure message.
 *
 * The pattern in Playwright:
 *
 *   const cases = [
 *     { label: 'case A', input: 'x', expected: 200 },
 *     { label: 'case B', input: 'y', expected: 400 },
 *   ];
 *
 *   for (const { label, input, expected } of cases) {
 *     test(`handles ${label}`, async ({ request }) => {
 *       // same test body, different inputs
 *     });
 *   }
 *
 * The loop runs at DEFINITION time — before any test runs. Playwright
 * reads the loop, creates N separate tests from it, then runs them.
 *
 * Why this matters at a real company:
 *   - One test to maintain instead of N near-identical tests
 *   - Adding a new case = adding one line to the array
 *   - Endpoint changes = update one place
 *   - Each case shows its own label in CI output — failures are easy to identify
 *
 * ── Suites in this file ─────────────────────────────────────────────────────
 *
 *   1. Malformed auth tokens — same endpoint, 8 different bad token formats
 *   2. Public routes — same check (should return 200) across multiple pages
 *   3. Auth-guarded routes — same check (should reject) across multiple endpoints
 *
 * Run: pnpm exec playwright test tests/api/parametrized-auth.spec.ts --project=ci
 */

import { test, expect } from '@playwright/test';
import { env } from '../../config/env';

// ════════════════════════════════════════════════════════════════════════════════
// SUITE 1 — Malformed auth tokens
//
// All of these should be rejected by the API. Rather than writing 8 separate
// tests that are 90% identical, we define the cases as a table and loop once.
//
// Each case has:
//   label       — what shows up in the test name in CI output
//   headers     — what we actually send (some cases have no Authorization at all)
//   description — why this case matters (for the reader, not the code)
// ════════════════════════════════════════════════════════════════════════════════

const MALFORMED_TOKEN_CASES = [
  {
    label:       'no Authorization header',
    headers:     {},
    description: 'Missing header entirely — baseline rejection case',
  },
  {
    label:       'empty Authorization value',
    headers:     { Authorization: '' },
    description: 'Header present but blank',
  },
  {
    label:       'token without Bearer prefix',
    headers:     { Authorization: 'plaintoken123' },
    description: 'Valid-looking token but missing the required Bearer scheme',
  },
  {
    label:       'Bearer with no token',
    headers:     { Authorization: 'Bearer' },
    description: 'Scheme present, token missing',
  },
  {
    label:       'Bearer with only whitespace',
    headers:     { Authorization: 'Bearer    ' },
    description: 'Whitespace-only token after scheme',
  },
  {
    label:       'malformed JWT — wrong segment count',
    headers:     { Authorization: 'Bearer a.b' },
    description: 'JWT must have 3 segments (header.payload.signature). Two segments is invalid.',
  },
  {
    label:       'malformed JWT — non-base64 payload',
    headers:     { Authorization: 'Bearer eyJhbGciOiJub25lIn0.!!!.signature' },
    description: 'Middle segment is not valid base64url',
  },
  {
    label:       'SQL injection attempt in token',
    headers:     { Authorization: "Bearer ' OR '1'='1" },
    description: 'Classic SQL injection — API must not expose DB errors or grant access',
  },
] as const;

// The loop runs once at startup — Playwright creates 8 separate tests from it.
// Each test has its own name, its own result, its own retry behaviour.

for (const { label, headers, description } of MALFORMED_TOKEN_CASES) {
  test(`@security @api rejects malformed token: ${label}`, async ({ request }) => {
    // description is a comment for the reader — we attach it to the test
    // using testInfo so it appears in Allure reports
    const res = await request.get(`${env.baseUrl}/api/v1/documents`, { headers });

    // Documenso returns 400 for missing/blank tokens and 401 for invalid ones.
    // We accept either — the important thing is it never returns 200.
    expect(
      [400, 401, 403],
      `Expected rejection but got ${res.status()} — ${description}`,
    ).toContain(res.status());
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// SUITE 2 — Public routes (should all return 200)
//
// A different use of the same pattern: same assertion, different URLs.
// If any of these routes go down or start 404ing, we catch it immediately.
// ════════════════════════════════════════════════════════════════════════════════

const PUBLIC_ROUTES = [
  { path: '/',        label: 'homepage' },
  { path: '/signin',  label: 'signin page' },
] as const;

test.describe('@smoke public routes availability', () => {
  for (const { path, label } of PUBLIC_ROUTES) {
    test(`${label} returns 200`, async ({ request }) => {
      const res = await request.get(`${env.baseUrl}${path}`);
      expect(res.status(), `${label} at ${path} returned ${res.status()}`).toBe(200);
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// SUITE 3 — Auth-guarded API routes (should all reject unauthenticated requests)
//
// Same pattern again: we expect every one of these endpoints to reject a
// request with no auth header. This catches cases where someone accidentally
// removes an auth middleware from a route.
// ════════════════════════════════════════════════════════════════════════════════

const GUARDED_ENDPOINTS = [
  { path: '/api/v1/documents',        label: 'document list' },
  { path: '/api/v1/documents/1',      label: 'document by id' },
  { path: '/api/v1/profile',          label: 'user profile' },
] as const;

test.describe('@security auth-guarded endpoints reject unauthenticated requests', () => {
  for (const { path, label } of GUARDED_ENDPOINTS) {
    test(`${label} rejects request with no token`, async ({ request }) => {
      const res = await request.get(`${env.baseUrl}${path}`);

      expect(
        [400, 401, 403, 404],
        `${label} at ${path} returned ${res.status()} — expected auth rejection`,
      ).toContain(res.status());
    });
  }
});
