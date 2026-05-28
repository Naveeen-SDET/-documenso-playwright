# Changelog

All notable changes to this project are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
This project uses [Semantic Versioning](https://semver.org/).

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

[2.0.0]: https://github.com/naveen-sdet/-documenso-playwright/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/naveen-sdet/-documenso-playwright/releases/tag/v1.0.0
