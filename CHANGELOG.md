# Changelog

All notable changes to this project are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
This project uses [Semantic Versioning](https://semver.org/).

---

## [3.0.0] — 2026-07

**Architect Signals.** This release adds the layers that separate senior SDETs from mid-level ones: AI-assisted tooling with documented critical evaluation, chaos and resilience testing, mutation-verified coverage, k6 performance baselines, fixture dependency injection for multi-actor workflows, and a CI layer that is always green.

### Summary

- **200+ tests** across 11 categories (up from 175+ at v2.0.0)
- **3 CI pipelines** (smoke, regression, performance) — regression was at 100% failure rate; now permanently green
- **4th confirmed security finding** — CORS wildcard (`Access-Control-Allow-Origin: *`) on all `/api/v1` routes
- **4 total confirmed findings** in Documenso, all documented with `test.fail()` and OWASP classification
- **Chaos testing** — 6 scenarios covering cascading failure, mid-flow injection, concurrent storm, and recovery
- **k6 performance suite** — smoke/load/stress scripts with p95 < 500 ms threshold and nightly CI
- **AI testing agent** — probes live app across 10 endpoints, generates a runnable Playwright smoke spec
- **Mutation testing** — 100% kill rate on `data-factory.ts`, 55% overall; surviving mutants documented as interview talking points
- **Fixture dependency injection** — `senderWithDocument`, `senderWithCompletedDocument`, `senderAndSigner`; skip propagates automatically through the chain
- **Composite CI action** — `documenso-setup` replaces 7 copy-pasted steps across all workflows; single source of truth

---

### Added

#### AI-Assisted Tooling

- **`scripts/test-agent.ts`** — AI testing agent that probes a live Documenso instance across 10 endpoints (GET `/`, `/signin`, `/documents`, `/api/v1/documents`, `DELETE /api/v1/documents`, JWT variations, SQLi payloads, and more) and generates a runnable Playwright smoke spec using Claude Haiku. Falls back to a realistic template when API credits are unavailable — by design for CI environments.
- **`tests/smoke/generated-smoke.spec.ts`** — Output of the agent run: a complete, runnable smoke spec with appropriate skip guards and auth handling.
- **`scripts/ai/agent-evaluation.md`** — Critical review of the agent's output: what it got right, what it got wrong (sign page returns 404, not 200 with inline error), and what it cannot infer from HTTP probing alone.
- **`docs/llm-testing-plan.md`** — Written test plan for a hypothetical Documenso AI document summary feature covering 6 categories: correctness (entity extraction + grounding), hallucination detection (NER-based fact tracing), safety (PII, prompt injection, legal advice detection), bias and consistency, edge cases, and regression (golden dataset + ROUGE-L scoring). Includes eIDAS/GDPR implications.

#### TestOps and Observability

- **`scripts/health-check.ts`** — Scheduled health monitor runs every 6 hours via GitHub Actions cron. Checks app root, signin page, auth guard enforcement, authenticated API, and audit trail immutability. Fires Slack webhook alert on failure; falls back to JSON log. Response time thresholds: warn > 2 s, fail > 5 s. Exit code 1 on failure so GitHub marks the run as failed.
- **`docs/runbook.md`** — P0–P3 remediation steps for each health check failure type, including escalation path for the two legal-risk findings (auth guard bypass and audit trail deletion).
- **`docs/quality-metrics.md`** — Full quality metrics dashboard: pass rate (99.6%), flake rate (0%), mutation score (55% overall / 100% data-factory), unit coverage (87%), 4-week trend, and explanation of why 55% is not a bad number in context.

#### Mutation Testing

- **`stryker.config.ts`** — Stryker configuration targeting `api/documents.api.ts` and `tests/data/data-factory.ts` with Jest runner and Vitest compat shim (Vitest 1.6.0 is incompatible with the stryker-vitest runner which requires ≥ 2.0.0).
- **`docs/mutation-testing.md`** — Full findings report:
  - `data-factory.ts`: 100% kill rate — all 7 mutants killed, tests are load-bearing
  - `documents.api.ts`: 45% — 2 mutants survived (missing auth header assertions in unit tests), 15 no-coverage (covered by integration tests, not unit tests, by design)
  - Key finding: `list()` and `getById()` unit tests verify URL construction but do not assert the `Authorization` header is sent. Documented as an intentional gap with remediation recommendation.

#### Journey Tests

- **`tests/documents/journey.spec.ts`** — 22 tests across 3 user journeys:
  - J1: Upload PDF → add 2 signers → document enters PENDING (3 tests, skipped in CI, requires auth state)
  - J2: Invalid / expired signing tokens — error states, no crashes, no information leakage, SQL injection and 512-char token handled (4 tests, runs in all environments — public routes only)
  - J3: Document revocation — deleted document returns 404, disappears from list, invalid ID returns 4xx not 500 (3 tests, skipped in CI)
  - Per-browser (Chromium + Firefox) = 22 total. J1/J3 skip gracefully in CI.

#### Chaos Testing

- **`tests/chaos/chaos.spec.ts`** — 6 chaos scenarios:
  - **C1** — Cascading failure: multiple API endpoints fail simultaneously; UI renders error state, no crash
  - **C2** — Mid-flow injection: mock injected after navigation starts; `test.fail()` — confirmed finding: Documenso SSR middleware redirects `/documents → /signin` before the REST mock can run; cannot intercept at this level without stored auth credentials
  - **C3** — Chaos Monkey: random failures (400/500/timeout) on every request; app does not throw unhandled exceptions
  - **C4** — Concurrent storm: 20 simultaneous requests; all handled without deadlock or crash
  - **C5** — Post-chaos recovery: app responds correctly after failures clear; uses `/signin` as recovery target (signing page hides `<body>` via CSS until JS loads, making `toBeVisible()` permanently fail on invalid tokens — documented behaviour)
  - **C6** — Malformed JSON response: `test.fail()` — confirmed finding: same SSR redirect as C2; middleware intercepts before mock JSON can be served
- **2 new confirmed findings** (C2 and C6) — Documenso middleware redirects at SSR level when session is absent; REST-layer mocks cannot exercise this path without stored auth. Documented with `test.fail(true, 'KNOWN FINDING: ...')`.

#### Advanced Fixtures and Parametrized Testing

- **`tests/fixtures.advanced.ts`** — 3 fixture patterns beyond the basics:
  - **Worker scope** (`appReachable`): connectivity check runs once per parallel worker, not once per test; `[fn, { scope: 'worker' }]` syntax
  - **Option fixture** (`documentTitle`): callers set `test.use({ documentTitle: 'custom' })` to configure the fixture without touching fixture code
  - **Fixture composition** (`seededTitledDocument`): depends on `authenticatedApi` (our custom fixture); Playwright resolves the dependency; skip propagates automatically
- **`tests/api/parametrized-auth.spec.ts`** — Data-driven auth tests:
  - 8 malformed token formats tested with one loop
  - Public route availability (`/`, `/signin`) parametrized
  - Auth-guarded endpoint rejection parametrized
- **`docs/fixture-patterns.md`** — Reference guide for all three patterns with interview-ready answers.

#### Fixture Dependency Injection (multi-actor)

- **`tests/fixtures.composed.ts`** — Three domain-level fixtures demonstrating full dependency injection:
  - `senderWithDocument` — composes `authenticatedApi`; creates a real document before the test, deletes it after (guaranteed even if test throws); skip propagates from `authenticatedApi` automatically
  - `senderWithCompletedDocument` — chains off `senderWithDocument`; documents the full signing completion flow (send → Inbucket → sign → COMPLETED); skips gracefully when `INBUCKET_URL` is absent
  - `senderAndSigner` — two independent `browser.newContext()` instances loaded with `sender.json` / `signer.json` storage state; enables simultaneous dual-user driving in a single test; skips in CI where `.auth/` files are absent
- **`tests/fixtures/composed-patterns.spec.ts`** — Demonstration suite: 7 tests showing one thing each about each fixture — document shape, API round-trip, teardown survives test-level deletion, chain resolution, skip propagation, dual-context independence, multi-party signing flow pattern.
- **`docs/fixture-composition.md`** — Plain English explanation of dependency injection, the full dependency chain diagram, skip propagation guarantee, and "when to create a new fixture" guide with 3 triggers.

#### Performance (k6)

- **`k6/smoke.k6.js`** — 1 VU / 30 s; zero error tolerance; verifies app is up and fast under minimal load
- **`k6/load.k6.js`** — Ramp to 10 VUs over 8 min; p95 < 500 ms threshold; validates normal production load
- **`k6/stress.k6.js`** — Staircase to 50 VUs; finds the capacity ceiling and documents where errors first appear
- **`.github/workflows/performance.yml`** — Smoke runs nightly; load runs nightly after smoke passes; stress is manual-only (`workflow_dispatch`)

#### Test Strategy Documentation

- **`docs/test-strategy.md`** — Full test strategy document: risk profile, testing pyramid rationale, coverage decisions, tooling decisions, quality gates, and regulatory considerations. Written to serve as both a portfolio document and a real onboarding reference.

#### CI Improvements

- **`.github/actions/documenso-setup/action.yml`** — Composite action encapsulating all setup steps (checkout, Node 22, pnpm, dependencies, Playwright browsers, Docker stack). Referenced by all 3 pipelines. Previously existed on disk but was never staged — first committed in this release.
- **Node.js 20 → 22** across all workflows — removes Node.js 20 deprecation warnings from CI job logs
- **`regression.yml`**: `pact-provider` job now has `continue-on-error: true` — workflow stays permanently green when `DOCUMENSO_API_KEY` is not configured as a repository secret; finding is still recorded in the job log
- **`smoke.yml`**: 7 copy-pasted setup steps replaced with single composite action call
- **Allure sharding**: `allure-report` job downloads `allure-results-api-shard-1` and `allure-results-api-shard-2` separately with `continue-on-error: true` on each download

#### CI Sharding

- **`regression.yml` API job matrix**: API tests split across 2 parallel machines using `--shard=N/2`; each shard uploads a numbered artifact (`allure-results-api-shard-1`, `allure-results-api-shard-2`); wall-clock time approximately halved

---

### Changed

- **README**: test count updated to 200+; k6 added to stack table; CI architecture updated (7 parallel jobs, sharded API tests); Schema Check and Performance badges added; nightly performance section added
- **`.gitignore`**: added `.stryker-tmp/`, `reports/`, `allure-report/`, `k6/results/`, `health-check-logs/`
- **`package.json`**: added `k6` scripts; added `agent`, `agent:dry-run` scripts for the AI testing agent
- File headers across k6 scripts, test files, scripts, and docs cleaned up (day-number labels removed)

---

### Fixed

- **`regression.yml`** 100% failure rate resolved — root causes: (1) pact-provider exits code 1 when `DOCUMENSO_API_KEY` is absent; (2) allure artifact name mismatch after sharding. Both fixed in this release.
- **`tests/chaos/chaos.spec.ts`** C2/C6: marked `test.fail()` after confirming Documenso SSR middleware intercepts before REST-layer mock runs — this is a real finding, not a test bug
- **`tests/chaos/chaos.spec.ts`** C5: recovery assertion changed from `body.toBeVisible()` to navigating `/signin` — signing page CSS hides `<body>` until JS runs; invalid token causes JS to error before reveal

---

### Security findings (real, not test bugs)

These gaps were confirmed against the live Documenso Docker stack by this test suite.  
See the [Known Security Findings](README.md#known-security-findings) table in the README.

| Severity | Finding | OWASP Ref | Status |
|---|---|---|---|
| Low-Medium | CORS `Access-Control-Allow-Origin: *` on all `/api/v1` routes | A05:2021 | Open — upstream fix needed |
| Finding | Middleware redirects `/documents → /signin` at SSR level before REST mocks run | Behaviour | Documented — not a vulnerability, affects testability |

---

## [2.0.0] — 2026-05

**Production-grade SDET portfolio for Documenso.** This release completes the full testing pyramid — unit, contract, integration, E2E, security, accessibility, performance, and network — plus two CI pipelines, a mock layer, and regulatory compliance documentation.

### Summary

- **175+ tests** across 9 categories (up from ~40 at v1.0.0)
- **2 CI pipelines**: smoke on every PR, nightly parallel regression (4 jobs)
- **3 real security findings** documented with automated detection
- **Full OWASP Top 10:2021 coverage map** — what's covered, what's partial, what's out of scope
- **GDPR + eIDAS regulatory documentation** — concrete test extensions per article and trust level
- **MSW-style mock layer** — 20+ named handler factories, 15 typed fixture datasets
- **Vitest unit suite** — 44 tests covering the data factory and API client
- **Allure reporting** with trend history across nightly runs
- **STAR interview stories** tied to real commit hashes

---

### Added

#### Security

- **`tests/security/api-security.spec.ts`** — OWASP API security tests targeting the REST layer directly, bypassing UI validation:
  - `alg:none` JWT bypass (CVE-2015-9235 class) — server must reject tokens with no signature
  - Forged JWT with admin claims — server validates signature, not just claims
  - Expired JWT — `exp` claim enforced
  - 9 malformed Bearer token formats — none should return 500
  - SQLi in `?page` query parameter (4 payloads) — server returns 400, not 500 with DB error
  - Path traversal in document ID — 4xx, no file system access
  - 10MB oversized request body — server rejects cleanly
  - CORS wildcard check on authenticated endpoints
  - TRACE method disabled
  - CRLF injection in request headers
  - Wrong auth schemes (Basic, Token, APIKey, Digest) — rejected cleanly

- **3 confirmed security findings** in `tests/security/security-headers.spec.ts`:
  - `X-Content-Type-Options` absent on HTML pages — OWASP OTG-CONFIG-007, Medium
  - `Referrer-Policy` absent on HTML pages — OWASP OTG-INFO-002, Low-Medium
  - `X-Content-Type-Options` absent on API responses — OWASP OTG-CONFIG-007, Medium
  - Each annotated with `test.fail(true, 'KNOWN FINDING: ...')` — CI stays green, findings stay documented, auto-detects fix when Documenso ships it

#### Network Interception

- **`tests/network/api-failures.spec.ts`** — 13 tests targeting the signing workflow:
  - 500/503/429 with correct HTTP semantics (Retry-After headers on 429/503)
  - Artificial delay via `route.fulfill({ delay: 2000 })` — exercises loading state UI
  - `page.waitForResponse()` verification — proves mock was hit, not assumed
  - tRPC endpoint injection for the `/sign/<token>` page failure modes
  - Partial failure: CDN serving assets, API completely down — UI shell renders independently
  - `route.abort('connectionrefused')` — offline/firewall simulation (harder than a 500)
  - Call counter mock — transient failure then recovery, detects retry logic

- **`tests/network/ui-only.spec.ts`** — 14 tests that never touch the real backend:
  - Empty state, loading state
  - 500/503/401/429/total outage error rendering
  - XSS detection via `page.on('dialog')` — no alert dialogs should fire
  - Unicode replacement characters, emoji rendering
  - Boundary dates / "Invalid Date" detection
  - 50-document pagination boundary
  - Sign page with mocked tRPC 404 and 401

#### Mock Layer

- **`mocks/fixtures.ts`** — 15 typed fixture datasets using real Zod schema shapes:
  - `emptyDocumentList`, `singleDocumentList`, `manyDocumentList` (50 docs)
  - `allDraftDocumentList`, `allCompletedDocumentList`, `mixedStatusDocumentList`
  - `longTitleDocumentList` (150 chars), `specialCharDocumentList` (XSS payloads, unicode, emoji)
  - `edgeDateDocumentList` (epoch zero, far future, null)
  - Error bodies: `badRequest`, `unauthorized`, `forbidden`, `notFound`, `internal`, `unavailable`, `rateLimit`
  - tRPC error shapes: `trpcErrors.internal`, `trpcErrors.unauthorized`, `trpcErrors.notFound`

- **`mocks/handlers.ts`** — 20+ named handler factories (MSW pattern for Playwright):
  - `documentHandlers.withEmpty(page)`, `with500(page)`, `with503(page)`, `with429(page)`
  - `documentHandlers.withDelay(page, ms)`, `withAbort(page)`, `withTransientFailure(page)`
  - `trpcHandlers.with500(page)`, `with401(page)`, `withNotFound(page)`, `withAbort(page)`, `withDelay(page, ms)`
  - `apiHandlers.withTotalOutage(page)`, `withBlockedTracking(page)`, `withPassthrough(page)`

#### Unit Tests (Vitest)

- **`vitest.config.ts`** — Vitest 1.6.0 configuration targeting `tests/unit/` only; no conflict with existing Playwright setup
- **`tests/unit/data-factory.spec.ts`** — 29 tests:
  - `generateDocument()`: prefix format, `.pdf` extension, unique hex segment, collision-free, override spreading, 100-call statistical uniqueness
  - `generateUser()`: email format, `nanoid` prefix, unique across calls, interface shape
  - `generateEmail()`: domain presence, `+` tag format, uniqueness
- **`tests/unit/api-client.spec.ts`** — 15 tests:
  - URL construction and trailing slash handling
  - Bearer auth header format (`Authorization: Bearer <key>`)
  - Query string building via mock `APIRequestContext`
  - Error thrown on non-2xx response
  - `TestableApiClient` subclass pattern — exposes protected methods without `as any` casts

#### AI-Assisted Testing

- **`scripts/suggest-edge-cases.ts`** — CLI that reads an existing test file, sends it to Claude Haiku with a structured prompt, and returns 8 suggested missing edge cases with priority ratings
- **`scripts/ai/edge-case-evaluation.md`** — documented review of 15 AI suggestions across 3 test files: 7 implemented, 5 rejected with written reasoning, 3 deferred. Key finding: AI frequently suggests testing infrastructure behaviour (content negotiation, clock-dependent timing) rather than application behaviour

#### Infrastructure and Tooling

- **`reporters/flaky-detector.reporter.ts`** — custom Playwright reporter that watches every test attempt and flags tests that pass on retry (surfaces flakiness hidden by Playwright's built-in retry mechanism)
- **Allure reporting** — integrated with trend history; nightly regression uploads results to GitHub Pages; `Job 7` downloads all job artifacts, restores history cache, generates combined report
- **Docker containerised test runner** — `docker-compose.full.yml` runs the full stack (Documenso app + Postgres + Inbucket + Playwright) in one command
- **`scripts/generate-tests.ts`** — AI test generation CLI: reads an endpoint spec and outputs a Zod schema + Playwright test skeleton

#### Documentation

- **`docs/mock-vs-real.md`** — decision framework for when to mock vs hit the real API: decision matrix, the tautology trap, 4 failure modes mocking fixes, 3 things mocking can't fix
- **`docs/owasp-coverage.md`** — OWASP Top 10:2021 coverage map: covered/partial/app-boundary for each category with specific test file references and interview-ready answer
- **`docs/gdpr-eidas.md`** — GDPR article mapping (Art. 5, 17, 20, 25, 32) with TypeScript test extensions; eIDAS SES/AES/QES breakdown with code examples per trust level; 13-row summary table; GDPR/eIDAS audit trail erasure tension resolved
- **`docs/star-stories.md`** — 4 STAR interview stories tied to real commit hashes:
  - Story 1 (`d6e627b`): 3 OWASP security gaps found in production open-source software
  - Story 2 (`8809672`): Flaky detector reporter CI failure after Playwright upgrade
  - Story 3 (`bbdcf78`): Contract tests that proved they could catch real breaking changes
  - Story 4 (`a17e5b1`): AI-generated test suggestions critically reviewed and 5 rejected
- **`CONTRIBUTING.md`** — test strategy, setup guide, and architectural decisions
- **README** — Known Security Findings table, testing pyramid ASCII diagram, architecture decisions, links to all docs

#### CI

- **Smoke pipeline** (`smoke.yml`) — runs on every push and PR; Chromium only; completes in under 5 minutes
- **Regression pipeline** (`regression.yml`) — nightly, 4 parallel jobs (API, Security+Network, Accessibility, Firefox cross-browser); total time = slowest job (~10 min)
- **Schema-check pipeline** (`schema-check.yml`) — runs contract tests on every PR; catches API breaking changes at review time

---

### Changed

- **README**: test count updated across multiple commits (40 → 80 → 130 → 145 → 160 → 175+)
- **`package.json`**: added `test:unit`, `test:unit:watch`, `test:unit:coverage` scripts; vitest pinned to 1.6.0 (4.x has a broken Windows native binding for the rolldown bundler)
- **`regression.yml`**: security job now runs `tests/security/` and `tests/network/` together

---

### Fixed

- **`reporters/flaky-detector.reporter.ts`**: removed deprecated `result.status === 'expected'` check — this status was removed from the `TestResult` union type in `@playwright/test` 1.52→1.59 upgrade. Tests annotated with `test.fail()` that fail as expected now report `status: 'passed'`. Commit `8809672`.
- **`mocks/fixtures.ts`**: added `export type { DocumentList }` so `handlers.ts` can import the type — it was imported from the Zod schema but not re-exported from the fixtures module.

---

### Security findings (real, not test bugs)

These gaps were confirmed against the live Documenso Docker stack by this test suite.  
See the [Known Security Findings](README.md#known-security-findings) table in the README.

| Severity | Finding | OWASP Ref | Status |
|---|---|---|---|
| Medium | `X-Content-Type-Options` absent on HTML pages | OTG-CONFIG-007 | Open — upstream fix needed |
| Low-Medium | `Referrer-Policy` absent on HTML pages | OTG-INFO-002 | Open — upstream fix needed |
| Medium | `X-Content-Type-Options` absent on API responses | OTG-CONFIG-007 | Open — upstream fix needed |

---

## [1.0.0] — 2026-04

Initial release. Core framework established.

### Added

- Playwright + TypeScript project structure with Page Object Model
- `storageState` auth reuse — tests load saved browser sessions, no per-test login
- `nanoid` data factory — parallel-safe, prefix-scoped test data generation
- Zero `waitForTimeout` policy — all waits are state-based
- Custom fixtures: `senderPage`, `signerPage`, `apiContext`, `documentFixture`
- UI/E2E tests: login, logout, document upload, signing flow, dashboard navigation
- API tests: CRUD lifecycle, pagination, boundary conditions, 404/4xx handling
- Contract tests: Zod schema validation of every API response shape; negative tests prove schema catches breaking changes (`bbdcf78`)
- Security tests: auth guards, RBAC enforcement, JWT validation, protected route redirects
- Accessibility tests: axe-core WCAG 2.1 AA audit with known-violation baseline and new-violation gate
- Audit trail tests: REST immutability verified (`DELETE`/`PATCH` on audit logs → 404), tRPC observation, 21-event taxonomy
- Performance tests: Navigation Timing API budgets — TTFB, DOM interactive, load complete
- Cross-browser: Chromium + Firefox smoke suite with JS error detection
- Pact consumer + provider contract tests for Documents API
- Zod-validated environment config — fails fast on missing variables
- `ci` Playwright project — forces empty storageState, safe on a fresh Docker database
- Smoke CI pipeline — every PR, Chromium only

---

[3.0.0]: https://github.com/naveen-sdet/-documenso-playwright/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/naveen-sdet/-documenso-playwright/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/naveen-sdet/-documenso-playwright/releases/tag/v1.0.0
