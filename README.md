# documenso-playwright

[![Smoke](https://github.com/naveen-sdet/-documenso-playwright/actions/workflows/smoke.yml/badge.svg)](https://github.com/naveen-sdet/-documenso-playwright/actions/workflows/smoke.yml)
[![Regression](https://github.com/naveen-sdet/-documenso-playwright/actions/workflows/regression.yml/badge.svg)](https://github.com/naveen-sdet/-documenso-playwright/actions/workflows/regression.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)

Production-grade Playwright + TypeScript test framework for [Documenso](https://documenso.com) — an open-source electronic signature platform operating under eIDAS and UK e-signature regulations.

**190+ tests across 10 test categories. Two CI pipelines. Zero critical defect escapes.**

## Quality metrics

| Metric | Value | Target |
|---|---|---|
| Test pass rate | 99.6% | ≥ 99% |
| Flake rate | 0% | < 2% |
| Mutation score | 55% overall / 100% data-factory | ≥ 70% covered |
| Unit test coverage | 87% | ≥ 80% |

See [docs/quality-metrics.md](docs/quality-metrics.md) for full dashboard, trend history, and metric definitions.

---

## Why this project exists

Documenso handles legally binding document signing. The test surface is exactly what you'd find at a regulated-industry company: audit trail integrity, RBAC enforcement, accessibility compliance under the UK Equality Act 2010, API contract stability, and security validation.

This framework covers all of it — not just happy-path UI flows.

### Compliance finding worth highlighting

REST audit trail immutability is **verified**: `DELETE` and `PATCH` on `/api/v1/documents/:id/audit-logs` both return 404. Audit logs cannot be tampered with via the REST API.

Additionally: Documenso's audit data is only accessible to external integrators via tRPC, not REST. This is documented here as a compliance gap — the kind of finding that matters to teams building on top of Documenso in regulated industries.

---

## Known Security Findings

These are **real gaps confirmed against Documenso** by this test suite. They are not test bugs. The tests are annotated with `test.fail()` so CI stays green while the findings remain documented. If Documenso ships a fix, the affected test will flip to "unexpectedly passed" and alert us to remove the annotation.

| # | Header | Severity | OWASP Ref | Impact |
|---|---|---|---|---|
| 1 | `X-Content-Type-Options` absent on HTML pages | Medium | OTG-CONFIG-007 | Browsers may MIME-sniff responses — enables content injection via attacker-controlled response bodies |
| 2 | `Referrer-Policy` absent on HTML pages | Low-Medium | OTG-INFO-002 | Full page URLs (including query-string tokens and document IDs) may leak in the `Referer` header to third-party servers |
| 3 | `X-Content-Type-Options` absent on API responses | Medium | OTG-CONFIG-007 | API error bodies with user-influenced content could be MIME-sniffed as HTML/script |
| 4 | `Access-Control-Allow-Origin: *` on `/api/v1` endpoints | Low-Medium | A05:2021 | Wildcard CORS permits non-credentialed cross-origin reads of API responses from any origin |

**Recommended fix**: Add global response headers in `next.config.js` `headers()` or at the reverse-proxy/CDN layer:

```js
// next.config.js
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ],
  }];
}
```

These findings were identified through automated security header scanning (OWASP Testing Guide OTG-CONFIG-007) and confirmed with Docker-based CI runs.

---

## Test coverage

| Category | What's tested | Tag |
|---|---|---|
| **UI / E2E** | Login, logout, document upload, signing flow, dashboard navigation | `@ui` |
| **API** | CRUD, pagination, boundary conditions, response headers, 404/4xx handling | `@api` |
| **Contract** | Zod schema validation of every API response shape | `@contract` |
| **Security** | Auth guards, RBAC enforcement, malformed JWT, tampered token validation | `@security` |
| **Accessibility** | axe-core WCAG 2.1 AA audit — known-violation baseline + new-violation gate | `@a11y` |
| **Audit trail** | REST immutability, UI log verification, tRPC observation, 21-event taxonomy | `@audit` |
| **Performance** | Navigation Timing API budgets — TTFB, DOM interactive, load complete | `@perf` |
| **Network** | Route mocking (500/401/503/429), signing flow failures, slow response simulation, partial outage, offline abort, transient failure/retry | `@network` |
| **Chaos** | Cascading failure (REST + tRPC simultaneously), mid-flow injection, Chaos Monkey (50% failure rate), concurrent request storm, recovery after chaos clears, corrupted JSON response | `@chaos` |
| **Cross-browser** | Chromium + Firefox smoke suite, JS error detection | `@cross-browser` |

---

## Testing pyramid

This framework spans all four layers of the pyramid, with a deliberate opinion about where to invest:

```
          ▲
         /E\      E2E (Playwright UI)
        /───\     Fewest — slow, brittle, expensive
       / Int \    Integration/API (Playwright request)
      /───────\   Most value per test in this stack
     / Contract \ Contract (Zod schema validation)
    /─────────────\ Catches API breaking changes cheapest
   /  Unit tests   \ Pure functions only (Vitest)
  /─────────────────\ Fastest — data-factory, API client
```

**Unit** (`pnpm test:unit` — Vitest): Tests pure functions with zero dependencies — the data factory and API client URL/auth logic. These run in under 1 second and catch regressions in the shared infrastructure every test depends on.

**Contract** (`tests/api/contracts.spec.ts`): Zod schema validation against the real API. Every response shape is verified on every CI run. When Documenso changes a field, this layer fails first — not an E2E test three levels up where the root cause is invisible.

**Integration/API** (`tests/api/`): Full CRUD lifecycle, pagination, boundary conditions, error handling — all against the real running app. This is the highest-value layer for a backend-heavy product like Documenso. It gives deep coverage without browser overhead.

**E2E** (`tests/documents/`, `tests/auth/`): Reserved for flows a human must complete: sign-in, document upload, the signing wizard. These are the most expensive to run and the most brittle — kept narrow deliberately.

**The opinion:** In a document-signing platform, the API layer is the product. Investing more in API + contract testing than UI automation is the right call — the UI changes weekly, the API contract must be stable for customer integrations. See `docs/mock-vs-real.md` for the mock vs real decision framework.

---

## Architecture decisions

See `docs/test-strategy.md` for the complete test strategy — risk profile, pyramid rationale, coverage decisions, what is explicitly not tested and why, tooling decisions, quality gates, and regulatory considerations.

See `docs/mock-vs-real.md` for the full decision framework on when to mock vs hit the real API — including the decision matrix, the tautology trap, and the three things mocking can't fix.

See `docs/owasp-coverage.md` for the OWASP Top 10 coverage map — which categories are covered by automated tests, which the app boundary prevents testing, and which need dev-level access.

See `docs/gdpr-eidas.md` for the GDPR test coverage extension and eIDAS trust level analysis — SES vs AES vs QES, what testing looks like at each level, and the GDPR/eIDAS tension around audit trail erasure.

---

## Stack

| Tool | Purpose |
|---|---|
| **Playwright** | E2E automation, API testing, network interception, visual regression |
| **TypeScript** | Type safety across tests, fixtures, and API client |
| **Zod** | API response schema validation (contract testing) |
| **Vitest** | Unit tests for data factory and API client (44 tests, <1s) |
| **Jest + Pact** | Consumer/provider contract tests against the documents API |
| **axe-core** | WCAG 2.1 AA accessibility auditing |
| **Allure** | Test reporting with trend history and failure categorisation |
| **Docker Compose** | Full Documenso stack locally (app + Postgres + Inbucket) |
| **GitHub Actions** | CI — smoke on every PR, nightly parallel regression |
| **pnpm** | Package manager |

---

## CI architecture

### Smoke — every push and PR

```
Push / PR → checkout → install → clone documenso → docker up
         → wait for app → @smoke tests (Chromium, ci project)
         → done in under 5 minutes
```

### Nightly regression — 6 parallel jobs

```
00:00 UTC → ┌─ JOB 1: API + contract tests  (tests/api/)
            ├─ JOB 2: Security + Chaos      (tests/security/ + tests/network/ + tests/chaos/)
            ├─ JOB 3: Accessibility         (tests/accessibility/)
            ├─ JOB 4: Firefox               (cross-browser smoke)
            ├─ JOB 5: Unit + Pact           (vitest + jest)
            └─ JOB 6: Allure report         (aggregates all results, publishes trend)

Total time = slowest single job (~10 min), not the sum.
Each job spins up its own fresh Ubuntu runner + Docker stack.
```

---

## Architecture

```
documenso-playwright/
├── .github/workflows/
│   ├── smoke.yml          # Every push/PR — fast Chromium smoke
│   ├── regression.yml     # Nightly — 6 parallel jobs + Allure report
│   └── schema-check.yml   # TypeScript type check on every PR
├── api/
│   └── documents.api.ts   # Typed REST client wrapping Playwright APIRequestContext
├── config/
│   └── env.ts             # Zod-validated env loader — fails fast on missing vars
├── docs/
│   ├── gdpr-eidas.md      # GDPR/eIDAS compliance analysis + test coverage
│   ├── mock-vs-real.md    # Decision framework: when to mock vs use real API
│   └── owasp-coverage.md  # OWASP Top 10 coverage map
├── mocks/
│   ├── fixtures.ts        # 15 typed mock response datasets
│   └── handlers.ts        # Named route handler factories (MSW-style)
├── pact/                  # Consumer/provider contract tests
├── pages/                 # Page Object Model — BasePage, LoginPage, DashboardPage, DocumentPage
├── reporters/
│   ├── flaky-detector.reporter.ts   # Surfaces tests that only pass on retry
│   └── markdown-summary.reporter.ts # Writes test-results/summary.md on every run
├── schemas/
│   └── document.schema.ts # Zod schemas: DocumentSchema, RecipientSchema, FieldSchema, AuditLogSchema
├── scripts/
│   ├── generate-test.ts   # AI CLI: generates Zod schema + Playwright test from endpoint spec
│   └── suggest-edge-cases.ts # AI CLI: suggests missing edge cases for a test file
├── tests/
│   ├── setup/             # Auth state generation — .auth/sender.json + .auth/signer.json
│   ├── smoke/             # App availability, cross-browser
│   ├── auth/              # Login, logout, session enforcement
│   ├── documents/         # Dashboard, upload, signing flow, hybrid pattern
│   ├── api/               # CRUD, contracts, boundary conditions, negative tests
│   ├── security/          # Auth guards, RBAC, JWT, cookie attributes, input validation
│   ├── accessibility/     # axe-core WCAG 2.1 AA
│   ├── audit/             # Audit trail immutability + 21-event taxonomy
│   ├── performance/       # Navigation Timing API budgets
│   ├── network/           # Route mocking — 500/503/429/slow/abort/transient failure
│   ├── chaos/             # Chaos engineering — cascading failures, Chaos Monkey, recovery
│   └── visual/            # Screenshot regression with dynamic masking
├── unit/                  # Vitest unit tests — data factory + API client (44 tests)
├── utils/
│   └── data-factory.ts    # nanoid-prefixed test data — parallel-safe
└── tests/fixtures.ts      # Custom fixtures: senderPage, signerPage, apiContext, documentFixture
```

---

## Key design decisions

**storageState auth reuse** — Tests load saved browser sessions instead of logging in each time. The `setup` project runs first and creates `.auth/sender.json` and `.auth/signer.json`. `.auth/` is gitignored.

**Session isolation** — `logout.spec.ts` uses `signer.json`, not `sender.json`. The logout call deletes the DB session record — using the signer account ensures it never invalidates the sender session that document tests depend on.

**nanoid data factory** — Every test creates uniquely named resources (`doc-abc123-...`). Prevents cross-test contamination when tests run in parallel.

**Zero `waitForTimeout` policy** — No arbitrary sleeps. All waits are state-based: `waitForURL()`, `waitForLoadState()`, `expect.poll()`.

**`ci` Playwright project** — Forces empty storageState. Safe on a fresh Docker database with no pre-seeded accounts. Used by both CI pipelines.

**Hybrid test pattern** — API seed → UI verify → API teardown. Seeding via API is faster than seeding via UI, while verification still exercises the real user path.

---

## Quickstart

```bash
# 1. Start Documenso
cd documenso-app
docker compose -f docker/testing/compose.yml up -d

# 2. Install
cd ..
pnpm install
pnpm exec playwright install chromium

# 3. Environment
cp .env.example .env
# Edit .env — set BASE_URL, SENDER_EMAIL, SENDER_PASSWORD, SIGNER_EMAIL, SIGNER_PASSWORD

# 4. Run everything
pnpm exec playwright test

# 5. CI-safe subset (no pre-seeded accounts needed)
pnpm exec playwright test --project=ci

# 6. Run by category
pnpm exec playwright test --grep @security
pnpm exec playwright test --grep @api
pnpm exec playwright test --grep @a11y
```

---

## Selector strategy

| Priority | Method | When |
|---|---|---|
| 1st | `getByTestId()` | `data-testid` present |
| 2nd | `getByRole()` | Buttons, links, inputs |
| 3rd | `getByLabel()` | Form fields with labels |
| 4th | CSS | Last resort only |

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `BASE_URL` | Yes | Documenso app URL (default: `http://localhost:3000`) |
| `SENDER_EMAIL` | Yes | Test sender account email |
| `SENDER_PASSWORD` | Yes | Test sender account password |
| `SIGNER_EMAIL` | Yes | Test signer account email |
| `SIGNER_PASSWORD` | Yes | Test signer account password |
| `INBUCKET_URL` | No | Email server for signing flow tests (default: `http://localhost:9000`) |
| `DOCUMENSO_API_KEY` | No | API key for REST tests — tests skip gracefully if not set |

---

Built by [Naveen Kumar Manoharan](https://linkedin.com/in/naveen-kumar-manoharan444) · London, UK
