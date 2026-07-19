/**
 * k6 Load Test — Day 65
 *
 * What is a load test?
 * ─────────────────────
 * A load test simulates realistic user traffic over time. The pattern is:
 *
 *   1. Ramp up   — gradually add users (avoids a sudden thundering herd)
 *   2. Hold      — sustain the load for long enough to find slowdowns
 *   3. Ramp down — gradually remove users (clean teardown)
 *
 * Why ramp up gradually? If you send 50 users all at once, you're testing
 * cold-start behaviour, not normal load. Real traffic builds over time.
 *
 * This script targets the public API endpoints since we don't have stored
 * credentials for the authenticated endpoints in CI. In a real project you
 * would pass a pre-generated API token as an environment variable.
 *
 * Run locally:
 *   k6 run k6/load.k6.js
 *
 * With API key (enables authenticated tests):
 *   DOCUMENSO_API_KEY=your_key k6 run k6/load.k6.js
 *
 * Run with live output in the terminal:
 *   k6 run --out json=k6/results/load.json k6/load.k6.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL    = __ENV.BASE_URL           || 'http://localhost:3000';
const API_KEY     = __ENV.DOCUMENSO_API_KEY  || '';
const HAS_API_KEY = API_KEY.length > 0;

// ── Custom metrics ────────────────────────────────────────────────────────────
// k6 has built-in metrics (http_req_duration, http_req_failed, etc.).
// You can also define your own to track specific business flows.

const authGuardLatency = new Trend('auth_guard_latency_ms', true);
const publicPageErrors = new Rate('public_page_error_rate');

// ── Test configuration ────────────────────────────────────────────────────────

export const options = {
  // ── Stages (the load shape) ──────────────────────────────────────────────
  // Think of this as a graph over time:
  //
  //   VUs │         ┌──────────────┐
  //    10 │        /               \
  //     5 │       /                 \
  //     1 │──────                    ──────
  //       └──────────────────────────────── time
  //         1m      3m             1m
  stages: [
    { duration: '1m', target: 5  }, // ramp up to 5 VUs over 1 minute
    { duration: '3m', target: 10 }, // ramp up to 10 VUs over the next 3 minutes
    { duration: '3m', target: 10 }, // hold at 10 VUs for 3 minutes
    { duration: '1m', target: 0  }, // ramp down to 0 over 1 minute
  ],

  // ── Thresholds (pass/fail rules) ─────────────────────────────────────────
  thresholds: {
    // 95% of ALL requests must complete in under 500ms
    'http_req_duration':   ['p95<500', 'p99<1000'],

    // No more than 5% of requests may fail (HTTP errors or network errors)
    'http_req_failed':     ['rate<0.05'],

    // Our custom auth guard metric: 95th percentile under 200ms
    // Auth guards should be fast — they run on every authenticated request
    'auth_guard_latency_ms': ['p95<200'],

    // Public pages must have zero errors
    'public_page_error_rate': ['rate<0.01'],

    // At least 95% of all checks must pass
    'checks': ['rate>0.95'],
  },
};

// ── Default scenario ──────────────────────────────────────────────────────────

export default function loadTest() {

  // ── Group: Public pages ────────────────────────────────────────────────────
  // `group` organises results in the k6 output — same concept as test.describe()
  group('Public pages', () => {

    const homeRes = http.get(`${BASE_URL}/`);
    const homeOk  = check(homeRes, {
      'homepage 200': (r) => r.status === 200,
      'homepage <1s': (r) => r.timings.duration < 1000,
    });
    publicPageErrors.add(!homeOk);

    sleep(1);

    const signinRes = http.get(`${BASE_URL}/signin`);
    const signinOk  = check(signinRes, {
      'signin 200': (r) => r.status === 200,
      'signin <1s': (r) => r.timings.duration < 1000,
    });
    publicPageErrors.add(!signinOk);

    sleep(1);
  });

  // ── Group: API auth guards ─────────────────────────────────────────────────
  group('API auth guards', () => {

    // Every API endpoint should reject quickly — auth guard overhead must be low
    const endpoints = [
      '/api/v1/documents',
    ];

    for (const path of endpoints) {
      const res = http.get(`${BASE_URL}${path}`);
      authGuardLatency.add(res.timings.duration);

      check(res, {
        [`${path}: rejects without token`]: (r) => r.status >= 400 && r.status < 500,
        [`${path}: responds under 300ms`]:  (r) => r.timings.duration < 300,
      });

      sleep(0.5);
    }
  });

  // ── Group: Authenticated API (only if API key is set) ─────────────────────
  if (HAS_API_KEY) {
    group('Authenticated API', () => {
      const headers = { Authorization: `Bearer ${API_KEY}` };

      const listRes = http.get(`${BASE_URL}/api/v1/documents`, { headers });
      check(listRes, {
        'document list: 200':    (r) => r.status === 200,
        'document list: <500ms': (r) => r.timings.duration < 500,
        'document list: has documents field': (r) => {
          try {
            const body = JSON.parse(r.body);
            return Array.isArray(body.documents);
          } catch {
            return false;
          }
        },
      });

      sleep(1);
    });
  }

  // Think time — real users don't hammer endpoints without pausing
  sleep(Math.random() * 2 + 1); // random 1–3s pause between iterations
}
