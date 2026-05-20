# Contributing to documenso-playwright

This document explains how to run tests locally, how to add new tests, and the architectural decisions behind the test suite. Read it before opening a PR.

---

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Local setup](#local-setup)
3. [Running tests](#running-tests)
4. [Three-tier CI strategy](#three-tier-ci-strategy)
5. [Test categories and tags](#test-categories-and-tags)
6. [How to add a new test](#how-to-add-a-new-test)
7. [Test data factory](#test-data-factory)
8. [Contract testing — Zod vs Pact](#contract-testing--zod-vs-pact)
9. [Environment configuration](#environment-configuration)
10. [Code standards](#code-standards)

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime |
| pnpm | 10+ | Package manager |
| Docker | latest | Runs the Documenso app locally |
| Git | any | Version control |

---

## Local setup

```bash
# 1. Clone the repo
git clone https://github.com/naveen-sdet/documenso-playwright.git
cd documenso-playwright

# 2. Install dependencies
pnpm install

# 3. Install Playwright browsers
pnpm exec playwright install chromium --with-deps

# 4. Copy the example env file and fill in your values
cp .env.example .env

# 5. Start the Documenso app
git clone https://github.com/documenso/documenso.git documenso-app --depth=1
docker compose -f documenso-app/docker/testing/compose.yml up -d

# 6. Wait for the app to be ready (check http://localhost:3000)

# 7. Create an API token in the Documenso UI → Settings → API tokens
#    Paste it into .env as DOCUMENSO_API_KEY
```

---

## Running tests

### Schema and contract tests (no Docker required)

These run in under 60 seconds with no infrastructure.

```bash
# Negative Zod contract tests
pnpm exec playwright test tests/api/contracts-negative.spec.ts --project=ci

# BVA parameterized tests (boundary value analysis)
pnpm exec playwright test tests/api/documents-parameterized.spec.ts --project=ci

# Environment config validation tests
pnpm exec playwright test tests/config/env-validation.spec.ts --project=ci

# Pact consumer contract tests
pnpm test:pact:consumer
```

### Full test suite (Docker required)

```bash
# All CI-safe tests (API, security, a11y, contracts, cross-browser)
pnpm exec playwright test --project=ci

# Specific categories
pnpm exec playwright test tests/api/        --project=ci
pnpm exec playwright test tests/security/  --project=ci
pnpm exec playwright test tests/accessibility/ --project=ci

# Firefox cross-browser
pnpm exec playwright test tests/smoke/cross-browser.spec.ts --project=firefox

# Visual regression (creates baseline snapshots on first run)
pnpm exec playwright test --project=visual --update-snapshots
pnpm exec playwright test --project=visual
```

### Pact provider verification (Docker + API key required)

```bash
pnpm test:pact:provider
```

### View the HTML report

```bash
pnpm exec playwright show-report
```

---

## Three-tier CI strategy

Every change flows through three layers of automated testing:

```
Push / PR
   │
   ├─► Schema Check (.github/workflows/schema-check.yml)
   │     • No Docker, no browser install
   │     • Runs: Zod contract tests, BVA tests, Pact consumer tests
   │     • Time: < 60 seconds
   │     • Gates: every push to any branch
   │
   ├─► Smoke (.github/workflows/smoke.yml)
   │     • Docker required, Chromium only
   │     • Runs: full ci project (API, security, a11y, contracts)
   │     • Time: < 10 minutes
   │     • Gates: PRs to main
   │
   └─► Regression (.github/workflows/regression.yml)
         • Docker required, all browsers, 6 parallel jobs
         • Runs: everything including Firefox, Pact provider verification
         • Time: ~15 minutes (parallel)
         • Gates: nightly at 00:00 UTC
```

**Why three tiers?** Cost scales with urgency. A schema break is caught in 60 seconds on every push. An infrastructure-dependent regression is caught overnight without blocking anyone's PR.

After every CI run, a Markdown summary (`test-results/summary.md`) is uploaded as a GitHub Actions artefact — readable without opening the HTML report.

---

## Test categories and tags

Tests are tagged with `@`-prefixed labels in their `test.describe` names. Use `--grep` to run a subset:

```bash
pnpm exec playwright test --grep @api      --project=ci
pnpm exec playwright test --grep @security --project=ci
pnpm exec playwright test --grep @contract --project=ci
pnpm exec playwright test --grep @bva      --project=ci
pnpm exec playwright test --grep @a11y     --project=ci
pnpm exec playwright test --grep @config   --project=ci
```

| Tag | What it covers | Docker needed |
|-----|---------------|---------------|
| `@api` | API endpoint tests (auth, CRUD, pagination) | Yes |
| `@contract` | Zod schema validation against live API | Yes |
| `@bva` | Boundary value analysis on schemas | No |
| `@security` | Auth guards, token validation, protected routes | Yes |
| `@a11y` | WCAG 2.1 AA accessibility checks | Yes |
| `@config` | Environment configuration validation | No |

---

## How to add a new test

### 1. Choose the right location

```
tests/
├── api/          ← HTTP API tests (request fixture, no page)
├── security/     ← Auth and authorisation tests
├── accessibility/ ← axe-core WCAG tests
├── audit/        ← Audit trail tests
├── network/      ← Request interception and mocking
├── performance/  ← Page load budget tests
├── smoke/        ← Cross-browser smoke tests
├── visual/       ← Screenshot regression tests
└── config/       ← Configuration and tooling tests
```

### 2. Follow the naming convention

```
tests/api/documents-crud.spec.ts     ← feature + technique
tests/api/contracts-negative.spec.ts ← feature + testing approach
tests/config/env-validation.spec.ts  ← scope + what is validated
```

### 3. Add the right tag to the describe block

```typescript
test.describe('@api @contract My new tests', () => {
  // ...
});
```

### 4. Use the test data factory for any document payloads

```typescript
import { DocumentFactory } from '../../lib/factories/document.factory';

const payload = DocumentFactory.buildInput({ title: 'My test doc' });
const response = DocumentFactory.buildResponse({ status: 'PENDING' });
```

### 5. Skip gracefully when infrastructure is absent

Tests that hit the live API must skip cleanly when Docker is not running:

```typescript
let res: Awaited<ReturnType<typeof request.get>>;
try {
  res = await request.get(`${env.baseUrl}/api/v1/documents`);
} catch (e: any) {
  test.skip(true, `App not reachable (${e.code}) — start Docker first`);
  return;
}
```

### 6. Never hardcode credentials or API keys

```typescript
// ✗ Bad
headers: { Authorization: 'Bearer api_abc123' }

// ✓ Good
headers: { Authorization: `Bearer ${env.apiKey}` }
```

---

## Test data factory

The factory in `lib/factories/document.factory.ts` generates typed, repeatable test data. Always use it instead of inline object literals.

```typescript
import { DocumentFactory, RecipientFactory } from '../../lib/factories/document.factory';

// Build an API request payload (what you send TO the API)
const input = DocumentFactory.buildInput();
const input = DocumentFactory.buildInput({ title: 'Custom title' });

// Build a response shape (what you expect BACK from the API)
const response = DocumentFactory.buildResponse({ status: 'COMPLETED' });

// Build a list response
const list = DocumentFactory.buildListResponse(5, 2); // 5 docs, 2 pages

// Build a recipient
const recipient = RecipientFactory.buildResponse({ role: 'CC' });

// Reset sequence counter between tests if strict isolation is needed
DocumentFactory.reset();
```

**Why factories?** Hardcoded test objects cause copy-paste drift and invisible coupling between tests. Factories make ownership explicit and surface schema changes at compile time.

---

## Contract testing — Zod vs Pact

This repo uses two contract testing approaches. Use the right one for the job:

| Approach | When to use | Files |
|----------|-------------|-------|
| **Zod (positive)** | Prove the live API matches our schema today | `tests/api/contracts.spec.ts` |
| **Zod (negative)** | Prove our schema rejects bad shapes (has teeth) | `tests/api/contracts-negative.spec.ts` |
| **Pact consumer** | Define what we need from the provider; generate a contract file | `pact/consumer/documents.pact.spec.ts` |
| **Pact provider** | Verify the real API honours the consumer contract | `pact/provider/documents.provider.spec.ts` |

**Rule of thumb:** Start with Zod to validate the current API. Add Pact when you need to enforce that future API changes don't silently break consumers — especially useful in microservice environments where teams work independently.

The generated Pact contract file lives at `pacts/documenso-consumer-documenso-api.json`. Commit it so the provider verification job can read it in CI.

---

## Environment configuration

All environment variables are declared and validated in `config/env.ts` using Zod. If a variable is missing or malformed, the suite exits immediately with a clear error before any test runs.

```typescript
import { env } from '../../config/env';

// Use these derived booleans instead of comparing strings directly
if (!env.hasApiKey) {
  test.skip(true, 'Requires DOCUMENSO_API_KEY');
  return;
}

if (env.isCI) {
  // CI-specific behaviour
}
```

Add new variables by extending the `EnvSchema` in `config/env.ts` and adding them to `.env.example`. Never read `process.env` directly in test files.

---

## Code standards

- **TypeScript strict mode** is enabled. No `any` unless unavoidable and commented.
- **Imports** use relative paths. No path aliases.
- **Test descriptions** use plain English, not `should` language. Write `creates a document` not `should create a document`.
- **Assertions** include a custom message for non-obvious failures: `expect(x, 'because Y').toBe(z)`.
- **No `test.only`** in committed code — the `forbidOnly: !!process.env.CI` config will fail the CI run.
- **Async/await** everywhere. No `.then()` chains in test files.

---

*Questions? Open an issue or reach out at [naveenchamblay@gmail.com](mailto:naveenchamblay@gmail.com)*
