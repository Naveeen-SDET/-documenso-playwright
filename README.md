# documenso-playwright

[![Smoke](https://github.com/naveen-sdet/-documenso-playwright/actions/workflows/smoke.yml/badge.svg)](https://github.com/naveen-sdet/-documenso-playwright/actions/workflows/smoke.yml)
[![Regression](https://github.com/naveen-sdet/-documenso-playwright/actions/workflows/regression.yml/badge.svg)](https://github.com/naveen-sdet/-documenso-playwright/actions/workflows/regression.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)

Production-grade Playwright + TypeScript test framework for [Documenso](https://documenso.com) — an open-source electronic signature platform operating under eIDAS and UK e-signature regulations.

**130+ tests across 9 test categories. Two CI pipelines. Zero critical defect escapes.**

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

**Recommended fix for all three**: Add global response headers in `next.config.js` `headers()` or at the reverse-proxy/CDN layer:

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
| **Network** | Route mocking (500/401), asset blocking, request count thresholds | `@network` |
| **Cross-browser** | Chromium + Firefox smoke suite, JS error detection | `@cross-browser` |

---

## Stack

| Tool | Purpose |
|---|---|
| **Playwright** | E2E automation, API testing, network interception, visual regression |
| **TypeScript** | Type safety across tests, fixtures, and API client |
| **Zod** | API response schema validation (contract testing) |
| **axe-core** | WCAG 2.1 AA accessibility auditing |
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

### Nightly regression — 4 parallel jobs

```
00:00 UTC → ┌─ JOB 1: API tests         (all tests/api/)
            ├─ JOB 2: Security tests    (all tests/security/)
            ├─ JOB 3: Accessibility     (all tests/accessibility/)
            └─ JOB 4: Firefox           (cross-browser smoke)

Total time = slowest single job (~10 min), not sum of all jobs.
Each job spins up its own fresh Ubuntu runner + Docker stack.
```

---

## Architecture

```
documenso-playwright/
├── .github/workflows/
│   ├── smoke.yml          # Every push/PR — fast Chromium smoke
│   └── regression.yml     # Nightly — 4 parallel jobs
├── api/
│   └── documents.api.ts   # Typed REST client wrapping Playwright APIRequestContext
├── config/
│   └── env.ts             # Typed env loader — fails fast on missing vars
├── pages/                 # Page Object Model — BasePage, LoginPage, DashboardPage, DocumentPage
├── schemas/
│   └── document.schema.ts # Zod schemas: DocumentSchema, RecipientSchema, FieldSchema, AuditLogSchema
├── tests/
│   ├── setup/             # Auth state generation — creates .auth/sender.json + .auth/signer.json
│   ├── smoke/             # App availability, signin page, cross-browser
│   ├── auth/              # Login flows, logout, session enforcement
│   ├── documents/         # Dashboard and document list
│   ├── api/               # REST API tests — CRUD, contracts, boundary conditions
│   ├── security/          # Auth guards, RBAC, JWT validation
│   ├── accessibility/     # axe-core WCAG 2.1 AA
│   ├── audit/             # Audit trail immutability + event taxonomy
│   ├── performance/       # Navigation Timing API budgets
│   ├── network/           # Route mocking and request observation
│   └── visual/            # Screenshot regression with dynamic masking
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
