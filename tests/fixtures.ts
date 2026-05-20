import path from 'path';
import { test as base } from '@playwright/test';
import { DashboardPage } from '../pages/DashboardPage';
import { DocumentPage }  from '../pages/DocumentPage';
import { LoginPage }     from '../pages/LoginPage';
import { DocumentsApi }  from '../api/documents.api';
import type { Document } from '../api/documents.api';
import { env }           from '../config/env';

/**
 * Custom Playwright fixtures
 *
 * Why fixtures over beforeEach?
 * ──────────────────────────────
 * Playwright fixtures are composable, typed, and always tear down — even
 * when a test fails or is interrupted. `beforeEach/afterEach` blocks do not
 * guarantee cleanup if the test throws before `afterEach` is reached.
 *
 * The pattern for any resource-owning fixture:
 *
 *   myFixture: async ({}, use) => {
 *     const resource = await setup();   // runs before the test
 *     await use(resource);              // test runs here
 *     await teardown(resource);         // ALWAYS runs after, pass or fail
 *   }
 *
 * Fixtures compose naturally — `seededDocument` depends on `request`.
 * Playwright resolves the dependency graph for you.
 *
 * Fixtures in this file:
 *   dashboardPage     — navigates to /documents, provides DashboardPage POM
 *   documentPage      — provides DocumentPage POM
 *   loginPage         — navigates to /signin, provides LoginPage POM
 *   docsApi           — provides DocumentsApi (uses env.apiKey, may be empty)
 *   authenticatedApi  — provides DocumentsApi, SKIPS the test if no API key
 *   seededDocument    — creates a document before the test, deletes it after
 */

// ── Fixture types ─────────────────────────────────────────────────────────────

type Fixtures = {
  dashboardPage:    DashboardPage;
  documentPage:     DocumentPage;
  loginPage:        LoginPage;
  docsApi:          DocumentsApi;

  /** Pre-configured API client. Skips the test if DOCUMENSO_API_KEY is absent. */
  authenticatedApi: DocumentsApi;

  /**
   * A real document, created before the test and deleted after.
   * The test receives the full Document object (id, title, status, ...).
   * Deletion is guaranteed — runs even if the test throws.
   *
   * Skips if DOCUMENSO_API_KEY is absent or the app is unreachable.
   */
  seededDocument: Document;
};

// ── Sample PDF used by seededDocument fixture ─────────────────────────────────

const SAMPLE_PDF = path.resolve(__dirname, 'fixtures/sample.pdf');

// ── Extended test object ──────────────────────────────────────────────────────

export const test = base.extend<Fixtures>({

  // ── Page Object Models ──────────────────────────────────────────────────────

  dashboardPage: async ({ page }, use) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await use(dashboard);
  },

  documentPage: async ({ page }, use) => {
    await use(new DocumentPage(page));
  },

  loginPage: async ({ page }, use) => {
    const login = new LoginPage(page);
    await login.goto('/signin');
    await use(login);
  },

  // ── API helpers ─────────────────────────────────────────────────────────────

  docsApi: async ({ request }, use) => {
    await use(new DocumentsApi(request, env.baseUrl, env.apiKey));
  },

  /**
   * authenticatedApi
   *
   * Same as docsApi but skips the test when DOCUMENSO_API_KEY is not set.
   * Use this in tests that cannot proceed without a real API key — it removes
   * the need to write the same skip guard at the top of every test.
   *
   * @example
   *   test('lists documents', async ({ authenticatedApi }) => {
   *     const list = await authenticatedApi.list();
   *     expect(list.documents).toBeDefined();
   *   });
   */
  authenticatedApi: async ({ request }, use, testInfo) => {
    if (!env.hasApiKey) {
      testInfo.skip(true, 'Requires DOCUMENSO_API_KEY');
      return;
    }
    await use(new DocumentsApi(request, env.baseUrl, env.apiKey));
  },

  /**
   * seededDocument
   *
   * Creates a real document before the test and deletes it after — even if
   * the test fails. This is the key advantage over beforeEach/afterEach:
   * teardown is guaranteed because it lives inside the fixture's try/finally.
   *
   * The test receives the full Document object. If the test itself deletes
   * the document (e.g. a delete lifecycle test), the teardown swallows the
   * resulting 404 error silently.
   *
   * @example
   *   test('reads a seeded doc', async ({ seededDocument, authenticatedApi }) => {
   *     const doc = await authenticatedApi.getById(seededDocument.id);
   *     expect(doc.id).toBe(seededDocument.id);
   *   });
   */
  seededDocument: async ({ request }, use, testInfo) => {
    if (!env.hasApiKey) {
      testInfo.skip(true, 'Requires DOCUMENSO_API_KEY');
      return;
    }

    const api = new DocumentsApi(request, env.baseUrl, env.apiKey);

    // ── Setup ─────────────────────────────────────────────────────────────────
    let doc: Document;
    try {
      doc = await api.create(SAMPLE_PDF, `fixture-doc-${Date.now()}`);
    } catch (e: any) {
      if (e.message?.includes('ECONNREFUSED') || e.message?.includes('connect')) {
        testInfo.skip(true, 'App not reachable — start Docker first');
        return;
      }
      throw e;
    }

    // ── Hand the document to the test ─────────────────────────────────────────
    await use(doc);

    // ── Teardown (always runs) ────────────────────────────────────────────────
    try {
      await api.delete(doc.id);
    } catch {
      // Swallow — the test may have already deleted it as part of its assertions
    }
  },

});

export { expect } from '@playwright/test';
