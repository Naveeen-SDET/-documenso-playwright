# documenso-playwright

[![CI](https://github.com/Naveeen-SDET/-documenso-playwright/actions/workflows/smoke.yml/badge.svg)](https://github.com/Naveeen-SDET/-documenso-playwright/actions/workflows/smoke.yml)

End-to-end test suite for [Documenso](https://documenso.com) — an open-source e-signature platform. Built with Playwright + TypeScript targeting UK SDET sponsorship roles.

## Stack

- **Playwright** + **TypeScript** — E2E testing
- **pnpm** — package manager
- **Docker Compose** — runs the full Documenso stack locally

## Quickstart

```bash
# 1. Start the app
cd documenso-app
docker compose -f docker/testing/compose.yml up -d

# 2. Install dependencies (from project root)
cd ..
pnpm install

# 3. Install browsers
pnpm exec playwright install chromium

# 4. Run full suite
pnpm exec playwright test
```

## Environment variables

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

## Test structure

```
tests/
  setup/          # Auth state generation — runs before all tests
  smoke/          # App availability checks
  auth/           # Login + logout flows
  documents/      # Document list and dashboard
```

## Auth strategy

Tests reuse saved browser sessions instead of logging in on every test:

1. `tests/setup/auth.setup.spec.ts` runs first (via project dependency)
2. Logs in as `sender@test.com` and `signer@test.com`, saves cookies to `.auth/`
3. All subsequent tests load the saved session — no repeated logins
4. `.auth/` is gitignored — never committed to the repo

This eliminates flakiness from login rate limiting and keeps the suite fast.

**Session isolation by account:**
- `logout.spec.ts` uses `signer.json` — calling logout invalidates that session on the server (Documenso uses DB sessions). Using a dedicated account per concern means no cross-test contamination.
- `document-list.spec.ts` uses `sender.json` — untouched by logout tests.

## Selector strategy

Locator priority (highest to lowest):

1. `data-testid` — `getByTestId()`
2. ARIA role — `getByRole()`
3. Visible label — `getByLabel()`
4. CSS — last resort only

## CI

GitHub Actions runs on every push and PR using the `ci` project — tests that work against a fresh environment with no pre-seeded accounts. The full 16-test suite runs locally against Docker.

Playwright HTML report is uploaded as an artifact on failure.
