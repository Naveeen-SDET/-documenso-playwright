# Load Testing — k6

## What this is

Playwright tests verify correctness: does the app do the right thing for one user?

k6 tests verify performance under load: does the app stay fast when 50 users do things simultaneously? Where does it start to degrade?

For a document signing platform — where 500 recipients might all click their email links at the same moment (end of month, legal deadline) — this matters.

## How to run

Install k6: https://k6.io/docs/get-started/installation/

```bash
# Quick sanity check — 1 virtual user, 30 seconds
pnpm k6:smoke

# Normal load — ramps to 10 VUs over 8 minutes
pnpm k6:load

# Stress test — ramps to 50 VUs to find the breaking point
pnpm k6:stress
```

Against a live environment:

```bash
BASE_URL=https://staging.documenso.com k6 run k6/smoke.k6.js
```

With authenticated tests (requires API key):

```bash
DOCUMENSO_API_KEY=your_key k6 run k6/load.k6.js
```

## The three scripts

| Script | VUs | Duration | Question |
|--------|-----|----------|----------|
| `smoke.k6.js` | 1 | 30s | Is the app responding at all? |
| `load.k6.js` | ramp to 10 | 8 min | Does it stay fast under normal traffic? |
| `stress.k6.js` | ramp to 50 | 7 min | At what point does it degrade? |

## How to read k6 output

After a run, k6 prints a summary table. The key lines:

```
http_req_duration .......: avg=45ms   min=12ms  med=38ms  max=812ms p90=89ms p95=124ms
http_req_failed .........: 0.00%  0 out of 432
checks ...................: 100.00% 1296 out of 1296
```

**What these mean:**

`http_req_duration` — how long each HTTP request took. The important numbers are `p90` and `p95`: the 90th and 95th percentile. If `p95=124ms`, it means 95% of requests completed in under 124ms (only 5% were slower).

`http_req_failed` — what fraction of requests returned an error (network failure or a 5xx). Zero is what you want.

`checks` — k6's equivalent of assertions. Each `check()` call in the script is one check. This shows how many passed.

**Threshold failures look like this:**

```
✗ http_req_duration.....: p95<500 ✗ p95 was 823ms
```

That means the `p95<500` threshold failed — 5% of requests took longer than 500ms.

## Thresholds

Thresholds are the pass/fail rules defined in each script's `options.thresholds`. k6 exits with a non-zero code if any threshold is breached, which fails the CI job.

| Threshold | Meaning |
|-----------|---------|
| `p95<500` | 95% of requests complete under 500ms |
| `p99<1000` | 99% of requests complete under 1000ms |
| `rate<0.05` | Fewer than 5% of requests fail |
| `rate==1.0` | All checks pass (smoke test — zero tolerance) |

## Smoke test thresholds (strict)

The smoke test uses the strictest thresholds (`rate==1.0` for checks, `rate<0.01` for errors) because it only uses 1 VU. If a single user can't get a 200 from the homepage, nothing else matters.

## Stress test findings

Stress tests often deliberately fail thresholds — that's how you find the capacity limit. Run the stress test and look for:

1. **At which stage does p95 exceed 500ms?** That's your capacity ceiling under this traffic pattern.
2. **Does the error rate spike or stay flat?** A spike means requests are actively failing, not just slowing down. Failing is worse.
3. **After ramp-down, does latency return to baseline?** If it stays elevated, the app is not recovering (possible memory leak, connection pool exhaustion).

## CI

`performance.yml` runs:

- **Smoke** — every night at 00:30 UTC, always
- **Load** — every night (after smoke passes), or manually via `workflow_dispatch`
- **Stress** — manual trigger only (`workflow_dispatch` with `test_type: stress`)

Stress is manual-only because it's intentionally destructive. You run it deliberately before a major release, not on every nightly build.

## Interview answer

> "We have k6 load tests covering smoke, load, and stress scenarios. The smoke test runs on every nightly build to confirm the API is alive. The load test ramps to 10 concurrent users and validates our p95 threshold of 500ms. I ran the stress test before the v3.0.0 release and found that the auth guard endpoint started degrading at around 35 VUs on a single-container deployment — which gave the team a concrete capacity number to plan horizontal scaling against."
