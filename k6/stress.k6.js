/**
 * k6 Stress Test
 *
 * What is a stress test?
 * ──────────────────────
 * A stress test deliberately pushes the app beyond its normal operating
 * capacity to find the breaking point. The question is not "does it work?" —
 * it's "at what load does it start to degrade, and does it recover?"
 *
 * The shape is an escalating staircase:
 *
 *   VUs │                         ┌──┐
 *    40 │                    ┌────┘  │
 *    30 │               ┌────┘       │
 *    20 │          ┌────┘            │
 *    10 │     ┌────┘                 │
 *     0 └─────                        ──── (ramp down)
 *             1m   1m   1m   1m  1m  2m
 *
 * When we find the threshold where p95 latency exceeds our budget, we know
 * the system's capacity ceiling under this traffic pattern.
 *
 * What to look for in the results:
 *   - At which stage does p95 start climbing above 500ms?
 *   - Does error rate spike, or does the app degrade gracefully?
 *   - After ramp-down, does latency return to baseline? (recovery check)
 *
 * Run:
 *   k6 run k6/stress.k6.js
 *
 * Save results for comparison between runs:
 *   k6 run --out json=k6/results/stress-$(date +%Y%m%d).json k6/stress.k6.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// ── Test configuration ────────────────────────────────────────────────────────

export const options = {
  // Escalating staircase — each step adds 10 VUs and holds for 1 minute
  // Documenso running in a Docker container on a single GitHub Actions runner
  // will likely start degrading somewhere between 20–40 VUs. The point is to
  // find and record the number, not necessarily to pass.
  stages: [
    { duration: '1m', target: 10 }, // warm-up
    { duration: '1m', target: 20 }, // step 1
    { duration: '1m', target: 30 }, // step 2
    { duration: '1m', target: 40 }, // step 3 — likely degradation begins here
    { duration: '1m', target: 50 }, // step 4 — probable breaking point
    { duration: '2m', target: 0  }, // recovery — watch latency return to baseline
  ],

  // ── Thresholds ──────────────────────────────────────────────────────────────
  // Stress tests often FAIL thresholds by design — that's how you find limits.
  // These are set deliberately higher than the load test to capture findings
  // rather than immediately abort.
  thresholds: {
    // Allow p95 up to 2s during stress — we're looking for the shape, not a pass
    'http_req_duration': ['p95<2000'],
    // Allow up to 20% error rate — stress tests push beyond normal tolerances
    'http_req_failed':   ['rate<0.20'],
  },
};

// ── Scenario ──────────────────────────────────────────────────────────────────

export default function stressTest() {
  // Keep the scenario simple — same endpoint, maximum concurrency.
  // Adding complexity obscures which part of the stack is under stress.

  // ── Homepage hit ──────────────────────────────────────────────────────────
  const homeRes = http.get(`${BASE_URL}/`);
  check(homeRes, {
    'homepage responds': (r) => r.status === 200,
    'homepage <2s':      (r) => r.timings.duration < 2000,
  });

  sleep(0.2);

  // ── API auth guard hit ─────────────────────────────────────────────────────
  // Auth guard checks run on every request — they're the most common code path.
  // Under high load this is where caching, connection pooling, or session
  // validation becomes the bottleneck.
  const apiRes = http.get(`${BASE_URL}/api/v1/documents`);
  check(apiRes, {
    'API responds (any 4xx = auth guard working)': (r) => r.status >= 400,
    'API auth guard <1s under stress':             (r) => r.timings.duration < 1000,
  });

  // Minimal think time — stress tests deliberately keep users hammering
  sleep(0.5);
}

// ── Teardown: log summary after the test ──────────────────────────────────────
// This function runs once after all VUs finish.
// Use it to emit a finding summary — useful in CI logs.
export function teardown() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Stress test complete.');
  console.log('  Check the thresholds section above for pass/fail.');
  console.log('  Key questions to answer from the results:');
  console.log('    • At which stage (VU count) did p95 exceed 500ms?');
  console.log('    • Did error rate spike above 5% at any stage?');
  console.log('    • After ramp-down, did latency return to baseline?');
  console.log('═══════════════════════════════════════════════════════\n');
}
