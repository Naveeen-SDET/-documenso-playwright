# Run this from C:\Users\navee\documenso-playwright

# Step 1: Unstage everything (keep files on disk)
git rm -r --cached . | Out-Null

# Step 2: Commit in logical groups

git add package.json pnpm-lock.yaml package-lock.json tsconfig.json .gitignore .env.example playwright.config.ts
git commit -m "chore: project scaffold - Playwright, TypeScript, pnpm, Docker"

git add pages/
git commit -m "feat: Page Object Model - BasePage, LoginPage, DashboardPage, DocumentPage"

git add tests/setup/ tests/auth/
git commit -m "feat: auth setup - storageState reuse, sender and signer sessions, login and logout tests"

git add tests/fixtures.ts tests/fixtures/ utils/ tests/global-teardown.ts global-setup.ts
git commit -m "feat: fixtures and data factory - nanoid test isolation, apiContext, global teardown"

git add config/ api/
git commit -m "feat: typed API client - DocumentsApi, auth client, typed env loader"

git add tests/smoke/app-loads.spec.ts
git commit -m "feat: smoke tests - app availability and signin page checks"

git add tests/documents/ tests/email/ tests/helpers/
git commit -m "feat: document and email tests - upload, signing flow, Inbucket email verification"

git add tests/security/
git commit -m "feat: security tests - auth guards, RBAC enforcement, JWT and token validation"

git add tests/accessibility/
git commit -m "feat: accessibility tests - axe-core WCAG 2.1 AA audit with CI violation gate"

git add tests/visual/
git commit -m "feat: visual regression - screenshot baselines with dynamic content masking"

git add tests/performance/
git commit -m "feat: performance tests - Navigation Timing API budgets, TTFB, DOM interactive, load complete"

git add tests/network/
git commit -m "feat: network tests - route mocking 500/401, asset blocking, tRPC request observation"

git add tests/smoke/cross-browser.spec.ts
git commit -m "feat: cross-browser tests - Chromium and Firefox smoke suite, JS error detection"

git add tests/api/ schemas/
git commit -m "feat: API and contract tests - CRUD, boundary conditions, Zod schema validation"

git add tests/audit/
git commit -m "feat: audit trail tests - REST immutability verified, tRPC gap documented, 21-event taxonomy"

git add .github/
git commit -m "ci: smoke on every PR, nightly 4-job parallel regression covering API, security, a11y, Firefox"

git add README.md recommit.ps1
git commit -m "docs: production-grade README - test coverage table, CI architecture, design decisions"

# Step 3: Push
git push --force

Write-Host ""
Write-Host "Done! Run: git log --oneline" -ForegroundColor Green
