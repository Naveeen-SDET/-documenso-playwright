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

# 2. Install dependencies
pnpm install

# 3. Install browsers
pnpm exec playwright install chromium

# 4. Run tests
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
  setup/          # Auth state generation (runs before all tests)
  smoke/          # App availability checks
  auth/           # Login + logout flows
  documents/      # Document list and dashboard
```

## Selector strategy

Locator priority (highest to lowest):
1. `data-testid` — `getByTestId()`
2. ARIA role — `getByRole()`
3. Visible label — `getByLabel()`
4. CSS — last resort only

## CI

GitHub Actions runs the full suite on every push and PR. Playwright report uploaded as artifact on failure.
