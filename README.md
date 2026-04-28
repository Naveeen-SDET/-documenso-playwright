# documenso-playwright

[![CI](https://github.com/Naveeen-SDET/-documenso-playwright/actions/workflows/smoke.yml/badge.svg)](https://github.com/Naveeen-SDET/-documenso-playwright/actions/workflows/smoke.yml)

Production-grade E2E test suite for [Documenso](https://documenso.com) — an open-source electronic signature platform operating under eIDAS and UK electronic signature regulations. Built with Playwright + TypeScript.

## Why Documenso

Documenso handles legally binding document signing. The test surface covers:

- **Auth flows** — login, logout, session management, protected route enforcement
- **Document workflows** — upload, send for signature, sign, complete
- **Audit trails** — tamper-evident logs required by eIDAS QES/AES standards
- **RBAC** — sender vs signer permission boundaries
- **Email delivery** — signature request and completion notifications

This is a regulated-industry product where a missed test means a legally invalid signature.

## Stack

- **Playwright** + **TypeScript** — E2E testing
- **pnpm** — package manager  
- **Docker Compose** — full Documenso stack locally (app + Postgres + Inbucket)
- **GitHub Actions** — CI on every push and PR

## Quickstart

```bash
# 1. Start the app
cd documenso-app
docker compose -f docker/testing/compose.yml up -d

# 2. Install dependencies
cd ..
pnpm install
pnpm exec playwright install chromium

# 3. Copy env vars
cp .env.example .env

# 4. Run full suite
pnpm exec playwright test

# 5. Run CI-safe subset (no pre-seeded accounts needed)
pnpm exec playwright test --project=ci
```

## Test structure

```
tests/
  setup/       # Auth state generation — runs once before all tests
  smoke/       # App availability and signin page checks
  auth/        # Login flows, logout, protected route enforcement
  documents/   # Dashboard load and document list
```

## Auth strategy

Tests reuse saved browser sessions instead of logging in on every test:

1. `tests/setup/auth.setup.spec.ts` runs first via Playwright project dependency
2. Logs in as `sender@test.com` and `signer@test.com`, saves cookies to `.auth/`
3. All tests load the saved session — zero repeated logins, no rate limiting
4. `.auth/` is gitignored — never committed

**Session isolation:** `logout.spec.ts` uses `signer.json` so the logout call (which deletes the DB session record) never invalidates the `sender.json` session used by document tests.

## Selector strategy

| Priority | Method | When to use |
|----------|--------|-------------|
| 1st | `getByTestId()` | `data-testid` attribute present |
| 2nd | `getByRole()` | Interactive elements (button, link, input) |
| 3rd | `getByLabel()` | Form fields with visible labels |
| 4th | CSS locator | Last resort only |

## CI

GitHub Actions runs the `ci` project on every push and PR — tests that pass against a fresh Docker environment with no pre-seeded accounts. The full 16-test suite runs locally.

Playwright HTML report uploads as an artifact on failure.
