import { defineConfig } from 'vitest/config';

/**
 * Vitest config — unit test runner
 *
 * Why Vitest alongside Jest?
 * ─────────────────────────────
 * Jest is already configured for Pact consumer/provider tests (jest.config.ts).
 * Vitest is the modern standard for TypeScript unit tests — faster startup,
 * native ESM support, and a Jest-compatible API so tests look identical.
 *
 * The two runners are completely independent:
 *   jest  → pact/**  (contract tests, needs Pact mock server)
 *   vitest → tests/unit/**  (pure unit tests, zero dependencies)
 *
 * Run unit tests:   pnpm test:unit
 * Run unit watch:   pnpm test:unit:watch
 * Run with coverage: pnpm test:unit:coverage
 */
export default defineConfig({
  test: {
    // Pick up files in unit/ (project root) — kept outside tests/ so
    // Playwright's testDir ('tests/') never discovers them
    include: ['unit/**/*.spec.ts'],

    environment: 'node',

    // Globals: true means no need to import describe/it/expect in test files
    // (same as Jest's default behaviour)
    globals: true,

    // Coverage — run with pnpm test:unit:coverage
    coverage: {
      provider: 'v8',
      include: ['utils/**/*.ts', 'api/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/node_modules/**'],
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
    },

    // Timeout per test (ms)
    testTimeout: 5000,
  },
});
