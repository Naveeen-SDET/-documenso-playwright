/**
 * Advanced Playwright Fixtures — Day 61
 *
 * This file demonstrates the 3 fixture patterns you will encounter at any
 * company that uses Playwright seriously. The basics (per-test setup/teardown)
 * are already in tests/fixtures.ts. These go further.
 *
 * ─── Pattern 1: Worker scope ──────────────────────────────────────────────────
 *
 *   Normal fixtures run ONCE PER TEST.
 *   Worker-scoped fixtures run ONCE PER PARALLEL WORKER.
 *
 *   Playwright runs your tests across multiple worker processes in parallel.
 *   If you have 4 workers and 80 tests, a normal fixture runs 80 times.
 *   A worker-scoped fixture runs 4 times — once at the start of each worker.
 *
 *   Use worker scope for: connectivity checks, read-only shared config,
 *   anything expensive that is SAFE to share between tests in one worker.
 *   Never use it for state that one test modifies — that breaks isolation.
 *
 * ─── Pattern 2: Option fixtures ───────────────────────────────────────────────
 *
 *   An option fixture is a fixture whose default value can be overridden by
 *   the caller using test.use({ optionName: value }).
 *
 *   Think of it as: instead of hard-coding a value inside the fixture, you
 *   expose it as a configuration knob. Different describe blocks can set
 *   different values without duplicating any fixture code.
 *
 * ─── Pattern 3: Fixture composing a custom fixture ────────────────────────────
 *
 *   A fixture can declare another custom fixture as a dependency — not just
 *   Playwright built-ins like `page` or `request`. When it does, Playwright
 *   runs the dependency's setup first and passes the result in. If the
 *   dependency skips the test, the dependent fixture also skips — automatically,
 *   with no extra guard code needed here.
 *
 *   This is the "dependency injection" model. You don't call fixtures directly.
 *   You declare what you need, and Playwright wires it up.
 */

import { test as base } from './fixtures';
import type { Document }  from '../api/documents.api';
import { env }            from '../config/env';
import path               from 'path';
import axios              from 'axios';

const SAMPLE_PDF = path.resolve(__dirname, 'fixtures/sample.pdf');

// ── Fixture type declarations ─────────────────────────────────────────────────
//
// Playwright's extend<TestFixtures, WorkerFixtures>() takes two type arguments.
// Everything in the first argument runs per-test.
// Everything in the second argument runs per-worker.

type TestFixtures = {
  /**
   * Option: custom title passed to seededTitledDocument.
   * Override with test.use({ documentTitle: 'my title' }).
   * Default: 'auto-generated' (the fixture creates a unique title).
   */
  documentTitle: string;

  /**
   * A document created before the test and deleted after — like seededDocument
   * in fixtures.ts, but its title is controlled by the `documentTitle` option,
   * and it composes `authenticatedApi` instead of re-building an API client.
   */
  seededTitledDocument: Document;
};

type WorkerFixtures = {
  /**
   * Confirms the app is reachable, then hands every test in this worker
   * the base URL. Runs once per worker — not once per test.
   */
  appReachable: string;
};

// ── Extended test object ──────────────────────────────────────────────────────

export const test = base.extend<TestFixtures, WorkerFixtures>({

  // ─── Pattern 1: Worker-scoped connectivity check ─────────────────────────
  //
  // The `[fn, { scope: 'worker' }]` tuple syntax is how you declare
  // worker scope. Without it, the default is `{ scope: 'test' }`.
  //
  // Notice `use` still works the same way — setup, await use(value), teardown.
  // The only difference is when the fixture runs and how long the value lives.

  appReachable: [async ({}, use) => {
    try {
      await axios.get(env.baseUrl, { timeout: 5_000 });
      console.log(`[appReachable] Worker confirmed: ${env.baseUrl} is up`);
    } catch {
      // App unreachable — we still call use() so tests can decide what to do.
      // You could throw here instead if you want to abort ALL tests in this worker.
      console.warn(`[appReachable] ${env.baseUrl} did not respond — tests may skip`);
    }
    await use(env.baseUrl);
    // No teardown — we created nothing.
  }, { scope: 'worker' }],

  // ─── Pattern 2: Option fixture ────────────────────────────────────────────
  //
  // `{ option: true }` marks this as a fixture option rather than a fixture
  // that runs setup code. The second element of the tuple is its default value.
  //
  // Any test or describe block can override this by calling:
  //   test.use({ documentTitle: 'whatever' });
  //
  // The fixture itself does nothing — it just holds a value. Other fixtures
  // (seededTitledDocument below) read it via destructuring.

  documentTitle: ['auto-generated', { option: true }],

  // ─── Pattern 3: Fixture composing a custom fixture ───────────────────────
  //
  // `authenticatedApi` in the destructured arguments IS the fixture we defined
  // in fixtures.ts. Playwright runs authenticatedApi's setup code first, then
  // calls this function with the resulting DocumentsApi object.
  //
  // If authenticatedApi skips (because DOCUMENSO_API_KEY is not set),
  // seededTitledDocument automatically skips too — no guard needed here.
  //
  // `documentTitle` in the arguments IS the option fixture above. If a caller
  // set test.use({ documentTitle: 'custom' }), we get 'custom' here.

  seededTitledDocument: async ({ authenticatedApi, documentTitle }, use, testInfo) => {
    // Build the actual title — use the option if the caller set one,
    // otherwise generate a unique title from the test name.
    const title = documentTitle === 'auto-generated'
      ? `fixture-${testInfo.title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`
      : documentTitle;

    // Setup — create the document
    let doc: Document;
    try {
      doc = await authenticatedApi.create(SAMPLE_PDF, title);
    } catch (e: any) {
      if (e.message?.includes('ECONNREFUSED') || e.message?.includes('connect')) {
        testInfo.skip(true, 'App not reachable — start Docker first');
        return;
      }
      throw e;
    }

    // Hand the document to the test
    await use(doc);

    // Teardown — guaranteed to run even if the test threw
    try {
      await authenticatedApi.delete(doc.id);
    } catch {
      // Swallow — the test may have already deleted it
    }
  },

});

export { expect } from './fixtures';
