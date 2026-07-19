/**
 * k6 Smoke Test — Day 65
 *
 * What is a smoke test in load testing?
 * ──────────────────────────────────────
 * Same idea as a Playwright smoke test but for performance: run the smallest
 * possible load (1 virtual user, 30 seconds) just to confirm the app is alive
 * and responding within a sane time budget before running heavier tests.
 *
 * If the smoke test fails, there's no point running the full load test.
 *
 * Run locally (requires k6 installed — see README):
 *   k6 run k6/smoke.k6.js
 *
 * With a custom base URL:
 *   BASE_URL=https://staging.example.com k6 run k6/smoke.k6.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  // 1 virtual user for 30 seconds — lightest possible load
  vus:      1,
  duration: '30s',

  // ── Thresholds ──────────────────────────────────────────────────────────────
  // These are PASS/FAIL rules. k6 exits with a non-zero code if any are broken.
  // p95 = the 95th percentile: 95% of requests must complete within this time.
  // rate = what fraction of requests are allowed to fail (0 = zero tolerance).
  thresholds: {
    // 95% of requests must complete in under 1 second
    http_req_duration: ['p95<1000'],
    // Zero HTTP errors allowed in a smoke test
    http_req_failed:   ['rate<0.01'],
    // All our manual checks must pass
    checks:            ['rate==1.0'],
  },
};

// ── Scenario ──────────────────────────────────────────────────────────────────
// This function runs once per virtual user per iteration.
// k6 calls it in a loop for the duration defined above.

export default function smokeTest() {

  // ── 1. Homepage ─────────────────────────────────────────────────────────────
  const homepageRes = http.get(`${BASE_URL}/`);
  check(homepageRes, {
    'homepage: status 200':          (r) => r.status === 200,
    'homepage: response under 2s':   (r) => r.timings.duration < 2000,
    'homepage: has content-type':    (r) => r.headers['Content-Type'] !== undefined,
  });

  sleep(0.5);

  // ── 2. Signin page ───────────────────────────────────────────────────────────
  const signinRes = http.get(`${BASE_URL}/signin`);
  check(signinRes, {
    'signin: status 200':            (r) => r.status === 200,
    'signin: response under 2s':     (r) => r.timings.duration < 2000,
  });

  sleep(0.5);

  // ── 3. API auth guard ────────────────────────────────────────────────────────
  // The API should reject unauthenticated requests quickly.
  // We care about two things: (a) it rejects (4xx), (b) it's fast.
  const apiRes = http.get(`${BASE_URL}/api/v1/documents`);
  check(apiRes, {
    'API auth guard: rejects without token (4xx)': (r) => r.status >= 400 && r.status < 500,
    'API auth guard: responds under 500ms':        (r) => r.timings.duration < 500,
    'API auth guard: returns JSON':                (r) => {
      const ct = r.headers['Content-Type'] || '';
      return ct.includes('application/json');
    },
  });

  sleep(0.5);

  // ── 4. Non-existent route (404 check) ───────────────────────────────────────
  // The server should handle unknown routes gracefully and quickly.
  const notFoundRes = http.get(`${BASE_URL}/this-route-does-not-exist-k6-check`);
  check(notFoundRes, {
    'unknown route: returns 404':         (r) => r.status === 404,
    'unknown route: responds under 500ms':(r) => r.timings.duration < 500,
  });

  sleep(1);
}
