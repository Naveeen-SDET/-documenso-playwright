# Test Strategy — Documenso

**Author:** Naveen Kumar Manoharan  
**Version:** 1.0  
**Date:** 2026-06-10  
**Scope:** `documenso-playwright` test framework ([github.com/naveen-sdet/-documenso-playwright](https://github.com/naveen-sdet/-documenso-playwright))

---

## 1. Product Context

Documenso is an open-source electronic document signing platform. Users upload PDF documents, add signers, and send signing requests. Signers receive a tokenised link, review the document, and apply their signature. The completed document is stored with a tamper-evident audit trail.

**Why this matters for test strategy:** Document signing carries legal weight. Under eIDAS (EU/UK) a Simple Electronic Signature (SES) — which is what Documenso implements at its base tier — is legally binding in most commercial contexts. A defect that allows a document to be signed by the wrong party, corrupts the audit trail, or exposes a signing token is not just a UX bug. It is a legal liability.

This context drives every test priority decision in this document.

---

## 2. Risk Profile

Before deciding what to test, the risk surface must be identified. The following areas carry the highest consequence if defective:

| Risk area | Consequence of defect | Likelihood |
|---|---|---|
| Signing token security | Wrong person signs; forged signature | Medium |
| Audit trail integrity | Legally required record altered or deleted | Low (but catastrophic) |
| Authentication / session | Unauthorised access to documents | Medium |
| API authorisation (RBAC) | User accesses another user's documents | Medium |
| Document state transitions | Document signs in wrong order / skips steps | Low |
| PDF rendering fidelity | Signature applied to wrong page or position | Low |
| Email delivery | Signer never receives their link | Medium |

**Low-risk areas** (defects are recoverable, no legal consequence):
- UI cosmetics and layout
- Non-critical page performance
- Error message copy
- Third-party integrations (outside our test boundary)

This risk profile explains why security, API, and audit trail tests are more numerous than UI tests. The inverse of the typical enterprise test suite.

---

## 3. Testing Pyramid — With Rationale

```
              ▲
             /E\       E2E (Playwright UI)
            /───\      Fewest. Slow, brittle, expensive.
           / Int \     Integration / API (Playwright request)
          /───────\    Most tests here. High value per test.
         / Contract\   Contract (Zod schema + Pact)
        /───────────\  Catches breaking changes cheapest.
       / Unit tests  \ Pure functions only (Vitest).
      /───────────────\ Fastest. Data factory + API client.
```

**Unit (Vitest, 44 tests):** Tests pure functions in isolation — `data-factory.ts` (test data generation), `ApiClient` (URL construction, auth headers). These catch regressions in shared infrastructure that every other test depends on. Run in under 1 second. No network, no Docker.

**Contract (Zod + Pact):** Validates every API response shape against a declared schema on every CI run. If Documenso changes a response field, this layer fails first — before any E2E test three levels up gives a misleading error. Pact adds cross-team consumer-driven verification: the consumer writes the expectation, the provider proves it.

**Integration/API (Playwright `request` fixture):** The main investment layer. Full CRUD lifecycle, pagination, boundary conditions, security tests, chaos scenarios, performance budgets — all against the real running application, no mocks. This is the highest return-per-test layer for a backend-heavy product.

**E2E (Playwright browser):** Reserved for flows a human must complete: sign-in, document upload, the signing wizard. Narrow by design. The UI changes frequently; tests against it are expensive to maintain. Every UI test added must justify its existence over an equivalent API test.

**The opinion:** In a document-signing platform, the API is the product. A customer integrating Documenso into their workflow calls the REST API, not the UI. Investing more in API and contract testing than UI automation is the correct engineering trade-off.

---

## 4. What Is Tested — and Why

### Authentication and session management

Login, logout, session token invalidation, redirect enforcement for unauthenticated routes. Covered because: a failure here allows unauthorised access to legally sensitive documents. Session tests use a dedicated signer account to avoid invalidating the sender session that all document tests depend on.

### API authorisation (RBAC)

Requests made without a token (401), with a valid token to another user's resource (403), and with a tampered JWT (various attack classes). Covered because: document access must be strictly owner-scoped. The consequence of a missing auth guard is data exposure — not just an error.

### Contract / schema validation

Every API response shape is validated on every CI run against a Zod schema. Negative tests specifically prove the schema catches breaking changes — a contract test that has never failed has never been proven to work. Pact provider verification confirms the real API honours the consumer contract.

### Security headers and input validation

OWASP OTG-CONFIG-007 header scan (X-Content-Type-Options, Referrer-Policy, CORS). XSS and SQL injection payloads through every UI form and API parameter. JWT attack classes: `alg:none` bypass, forged claims, expired token. Covered because: four real gaps were found in Documenso and documented as known findings.

### Cookie attributes

HttpOnly, Secure, SameSite on session cookies. Post-signout invalidation. Covered because: a signing platform that allows session hijacking via XSS is a legal liability, not just a security finding.

### Audit trail

REST immutability verified: `DELETE /api/v1/documents/:id/audit-logs` returns 404. Covered because: eIDAS requires an immutable record of who signed what and when. An API that allows audit log deletion cannot be used in regulated deployments.

### Network resilience (failure modes)

Single endpoint failures (500, 503, 429, slow, abort), cascading failures (REST + tRPC simultaneously), mid-flow injection, Chaos Monkey (50% failure rate), concurrent storms, recovery after chaos clears, malformed JSON responses. Covered because: production failures are not always clean. The app must degrade gracefully rather than crash with an unhandled exception.

### Journey tests

Full end-to-end state transitions: upload → add signer → PENDING state, invalid signing token error paths, document revocation with API verification. Covered because: these are the flows that correspond to a user's legal act. A state machine defect here has legal consequence.

### Accessibility

axe-core WCAG 2.1 AA audit against key pages. Known-violation baseline pattern: existing violations are recorded and allowed; any new violation added beyond the baseline fails CI. Covered because: the UK Equality Act 2010 makes digital accessibility a legal obligation, not a best practice.

### Performance

Navigation Timing API budgets: TTFB < 1s, DOM interactive < 2s, full load < 3.5s on the signin page and dashboard. Covered because: performance regressions in a signing flow cause signers to abandon the process — a legally incomplete transaction.

### Visual regression

Screenshot baselines on nine key pages with dynamic element masking (timestamps, dynamic IDs). Covered because: PDF field placement and the signing UI must not shift between deployments.

---

## 5. What Is Explicitly Not Tested — and Why

**QES (Qualified Electronic Signatures):** Requires a Trust Service Provider, Hardware Security Module, PAdES signature format, and ETSI validation tooling. These cannot be simulated in a Docker-based test environment. Testing at this level requires access to a certified TSP sandbox and is explicitly out of scope.

**Email delivery reliability (end-to-end):** Inbucket captures emails in the local Docker stack. Real SMTP reliability, spam filter interaction, and link expiry under real mail provider conditions are outside the application's boundary and require production monitoring, not test automation.

**PDF rendering pixel-accuracy:** The exact visual rendering of a signed PDF depends on PDF engine version, operating system font rendering, and paper size. Pixel-level PDF assertion is not practical with Playwright and would require a specialised PDF comparison tool (e.g., pdfplumber with image diff). This is a known gap, mitigated by the visual regression tests against the signing UI.

**Third-party OAuth providers:** Documenso supports third-party SSO. Testing the OAuth flow requires a real provider sandbox credential and is outside the scope of this framework.

**Database integrity under load:** Concurrent write transactions, Prisma connection pool exhaustion under heavy load, and database constraint violations are best tested with a specialised load testing tool (k6, Locust) that can simulate real concurrency at the database layer, not at the browser layer.

**Signed PDF cryptographic verification:** Verifying that the final PDF's embedded digital signature is cryptographically valid requires a PDF signing library (e.g., `pdf-lib`, `itext`). This is a valuable test that is deferred to a future iteration.

---

## 6. Tooling Decisions

**Playwright over Cypress:** Playwright supports multiple browser contexts (required for sender/signer dual-actor tests) and has a first-class API testing fixture (`request`), eliminating the need for a separate HTTP client in test code. Playwright's `page.route()` is more capable than Cypress intercept for the chaos and network simulation scenarios in this suite.

**Playwright over Selenium:** Playwright's auto-waiting, modern selector engine, and built-in browser isolation make it the correct choice for a greenfield project in 2026. Selenium is maintained for legacy suites, not started fresh.

**Zod for contract testing (internal):** Zod runs in-process, has zero network dependency, and produces TypeScript-safe schemas. `z.infer<typeof Schema>` means the schema and TypeScript type are always in sync. Correct choice for internal API contract validation.

**Pact for cross-team contracts:** Pact's consumer-driven model is the industry standard for microservice contract testing. The consumer writes what it expects; the provider CI fails if those expectations are broken. Correct choice when the consumer and provider are owned by different teams or deployed independently.

**Vitest over Jest (for unit tests):** Vitest is ESM-native, faster, and shares tsconfig with the test suite. Jest is retained only for Pact tests because `@pact-foundation/pact` has a Jest-specific matcher interface. Two test runners, zero test conflicts — each is configured to target its own directory.

**axe-core over manual accessibility checks:** axe-core catches ~30% of WCAG violations automatically and does so on every CI run. Manual testing catches the remaining 70% (keyboard navigation, screen reader semantics, colour contrast under custom themes). Automated axe catches regressions; manual testing validates initial compliance.

---

## 7. Quality Gates

The following must pass before any change is merged to `main`:

| Gate | Tool | Threshold |
|---|---|---|
| TypeScript typecheck | `tsc --noEmit` | Zero type errors |
| Smoke tests | Playwright `ci` project | 100% pass rate |
| Contract tests | Zod schema validation | 100% pass rate |
| Unit tests | Vitest | 100% pass rate |

The following run nightly and block the release if they regress:

| Gate | Tool | Threshold |
|---|---|---|
| Full regression suite | Playwright (6 parallel jobs) | ≥ 99% pass rate |
| Security tests | Playwright `@security` | Known findings annotated; zero new failures |
| Accessibility | axe-core | Zero new violations beyond baseline |
| Performance budgets | Navigation Timing API | TTFB < 1s, load < 3.5s |
| Mutation score | Stryker | ≥ 70% on covered code |
| Flake rate | Custom reporter | 0% |

**Why these specific gates:** Pass rate without mutation score is an incomplete signal — a suite where every test asserts `expect(true).toBe(true)` has 100% pass rate and zero value. Mutation score proves the assertions are meaningful. Flake rate is a process signal: zero flake means the infrastructure is reliable, not just the tests.

---

## 8. Regulatory Considerations

**eIDAS (EU/UK Electronic Identification and Trust Services):**

Documenso's default signing mode is SES (Simple Electronic Signature) — a click-to-sign with email authentication. This is legally binding for most commercial contracts in the EU/UK but does not meet the threshold for regulated documents (property transactions, powers of attorney, pharmaceutical approval). The test suite verifies SES-level compliance: token security, audit trail immutability, and identity binding via email.

AES and QES testing would require identity verification integrations and certified Trust Service Provider access respectively. These are explicitly out of scope and documented in `docs/gdpr-eidas.md`.

**GDPR (General Data Protection Regulation):**

Art. 17 (right to erasure) creates a direct tension with eIDAS's requirement to preserve audit trails. The resolution verified in this suite: audit log metadata (cryptographic hash, timestamp, event type) is preserved; PII fields (signer name, email address) can be erased without breaking the audit chain's integrity. The `DELETE /api/v1/documents/:id/audit-logs` returning 404 confirms the REST API cannot be used to tamper with the audit trail.

---

## 9. Test Environment Strategy

**Local development:** Docker Compose stack (`documenso-app/docker/testing/compose.yml`) runs the full Documenso stack (app + Postgres + Inbucket email capture). Tests run against `http://localhost:3000`. Auth state is created once by the `setup` Playwright project and reused across the run.

**CI (every PR — smoke):** Fresh Ubuntu runner, Docker stack starts from scratch, `ci` Playwright project uses empty `storageState` — no dependency on pre-seeded accounts. Fast Chromium-only suite completes in under 5 minutes.

**CI (nightly — regression):** 6 parallel jobs, each with its own fresh Ubuntu runner and Docker stack. Total runtime = slowest single job (~10 minutes), not the sum of all jobs. Results aggregated into a single Allure report with trend history via GitHub Actions cache.

**No shared test environment:** Each run is fully isolated. There is no shared staging database that tests pollute. Every test creates and tears down its own data. This is enforced by the `seededDocument` fixture (guaranteed teardown) and the nanoid-prefixed data factory (no cross-test name collisions).

---

## 10. Test Data Strategy

All test data is ephemeral. The `data-factory.ts` generates uniquely prefixed identifiers via `crypto.randomUUID()` — `doc-<uuid>-...` — ensuring parallel tests never collide on shared resources.

The `seededDocument` fixture creates a real document before each test and deletes it after, even when the test fails or is interrupted. This is the key difference from `beforeEach/afterEach`: fixture teardown runs inside a try/finally and is guaranteed regardless of test outcome.

Static test data (known valid/invalid tokens, specific document IDs for edge-case tests) is either hardcoded inline with a comment explaining why it is static, or loaded from `mocks/fixtures.ts` (for mock response payloads).

There is no test data seeding script that runs before the suite. Every test is responsible for the data it needs. This constraint prevents hidden dependencies between tests and is the reason the suite can run in any order.

---

## 11. Known Limitations and Future Work

**Signed PDF verification:** The cryptographic validity of the final signed PDF is not asserted. Adding a `pdf-lib` assertion that the embedded signature is valid and the certificate chain is trusted would close this gap.

**Real email delivery:** Inbucket captures emails in Docker. A test that verifies deliverability through a real SMTP relay (e.g., using Mailsac or Mailtrap in CI) would cover the gap between local testing and production email behaviour.

**Two survived mutation test findings:** `list()` and `getById()` in `documents.api.ts` do not assert the Authorization header in unit tests. The unit tests verify URL construction but not auth header presence. These are documented findings — the header is tested implicitly in integration tests but a unit-level assertion would give earlier feedback.

**Accessibility manual coverage:** axe-core covers ~30% of WCAG AA. The remaining 70% (keyboard navigation order, screen reader label association, focus management in modals) requires a manual audit pass. This is recommended before a production accessibility compliance assessment.

**Load testing:** `tests/chaos/chaos.spec.ts` simulates concurrent load at the browser level. Database-level concurrency testing (connection pool exhaustion, row locking under simultaneous write transactions) requires a tool like k6 or Locust. This is a known gap for high-volume deployments.

---

*For the OWASP coverage map see `docs/owasp-coverage.md`.  
For the GDPR/eIDAS breakdown see `docs/gdpr-eidas.md`.  
For the mock vs real decision framework see `docs/mock-vs-real.md`.*
