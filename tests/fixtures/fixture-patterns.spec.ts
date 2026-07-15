/**
 * Fixture Patterns — demonstration suite (Day 61)
 *
 * These tests exist to prove the 3 advanced fixture patterns work correctly.
 * They are not testing business logic. Think of them as "tests for your test
 * infrastructure" — the kind of thing a senior SDET writes when setting up
 * a framework to make sure it behaves as expected before the rest of the team
 * starts using it.
 *
 * Run (no Docker needed for patterns 1 and 2):
 *   pnpm exec playwright test tests/fixtures/fixture-patterns.spec.ts --project=ci
 *
 * Pattern 3 requires DOCUMENSO_API_KEY and Docker — it skips gracefully otherwise.
 */

import { test, expect } from '../fixtures.advanced';

// ════════════════════════════════════════════════════════════════════════════════
// PATTERN 1 — Worker-scoped fixture
//
// appReachable runs ONCE when this worker boots, then all tests in this file
// receive the cached result. Watch the terminal: you'll see one log line
// "[appReachable] Worker confirmed: ..." regardless of how many tests run.
// ════════════════════════════════════════════════════════════════════════════════

test.describe('Pattern 1 — worker scope', () => {

  test('appReachable returns the base URL string', async ({ appReachable }) => {
    // This fixture ran during worker startup — not right now.
    // We're just consuming the value it returned.
    expect(appReachable).toMatch(/^https?:\/\//);
  });

  test('second test: no additional setup call (worker fixture already ran)', async ({ appReachable }) => {
    // If you add console.log('[appReachable] ...') in the fixture and run this
    // suite, you'll see the log printed ONCE — not once per test.
    expect(appReachable).toBeTruthy();
  });

  test('third test: same cached value, zero extra cost', async ({ appReachable }) => {
    expect(appReachable).toContain('localhost');
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// PATTERN 2 — Option fixtures
//
// documentTitle is an option with a default value of 'auto-generated'.
// A describe block can override it with test.use({ documentTitle: '...' }).
// Different describe blocks can set different values — no fixture code changes.
// ════════════════════════════════════════════════════════════════════════════════

test.describe('Pattern 2 — option fixture: default value', () => {

  test('documentTitle is auto-generated when not overridden', async ({ documentTitle }) => {
    expect(documentTitle).toBe('auto-generated');
  });

});

test.describe('Pattern 2 — option fixture: overridden value', () => {
  // test.use() sets the option for every test inside this describe block.
  // Nothing outside this block is affected.
  test.use({ documentTitle: 'overridden-by-caller' });

  test('documentTitle is now the value the caller set', async ({ documentTitle }) => {
    expect(documentTitle).toBe('overridden-by-caller');
  });

  test('second test in same describe: also sees the overridden value', async ({ documentTitle }) => {
    expect(documentTitle).toBe('overridden-by-caller');
  });

});

test.describe('Pattern 2 — different block, different option', () => {
  test.use({ documentTitle: 'different-block-different-value' });

  test('each describe block can set its own option independently', async ({ documentTitle }) => {
    expect(documentTitle).toBe('different-block-different-value');
  });

});

// ════════════════════════════════════════════════════════════════════════════════
// PATTERN 3 — Fixture composing a custom fixture
//
// seededTitledDocument depends on:
//   - authenticatedApi (our custom fixture from fixtures.ts)
//   - documentTitle    (the option fixture above)
//
// Playwright resolves the dependency graph:
//   1. authenticatedApi setup runs first
//   2. If it skips (no API key), seededTitledDocument skips automatically
//   3. If it doesn't skip, seededTitledDocument gets the api client + option value
//   4. The test runs with the created document
//   5. seededTitledDocument teardown deletes the document
//   6. authenticatedApi teardown runs (none in this case)
//
// These tests skip gracefully when DOCUMENSO_API_KEY is not set.
// ════════════════════════════════════════════════════════════════════════════════

test.describe('Pattern 3 — composed fixture: auto-generated title', () => {

  test('seeded document exists and has an id', async ({ seededTitledDocument }) => {
    // If we reach this line, authenticatedApi ran successfully and created a doc.
    // teardown will delete it after this test finishes.
    expect(seededTitledDocument.id).toBeDefined();
    expect(typeof seededTitledDocument.id).toBe('number');
  });

  test('seeded document title contains the test name', async ({ seededTitledDocument }) => {
    // auto-generated title includes the test name (slugified)
    expect(seededTitledDocument.title).toContain('seeded-document-title-contains');
  });

});

test.describe('Pattern 3 — composed fixture: custom title via option', () => {
  // Combine patterns 2 and 3: set the option, and the composed fixture uses it.
  // This is how you test the same fixture with different configurations
  // without duplicating any setup code.
  test.use({ documentTitle: 'pattern-3-custom-title' });

  test('document is created with the title from the option', async ({ seededTitledDocument }) => {
    expect(seededTitledDocument.title).toBe('pattern-3-custom-title');
  });

});
