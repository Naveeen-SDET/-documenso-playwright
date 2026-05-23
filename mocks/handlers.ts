/**
 * mocks/handlers.ts — MSW-style route handler factories for Playwright
 *
 * What is "MSW-style"?
 * ─────────────────────
 * Mock Service Worker (MSW) popularised the pattern of defining reusable,
 * named request handlers in a central file, then composing them per test.
 * MSW intercepts at the Service Worker layer (browser-native).
 *
 * Playwright's page.route() achieves the same at the proxy layer — no SW
 * needed, works in headless CI, and doesn't require your app to import MSW.
 *
 * This file wraps page.route() calls into named, composable factory functions.
 * The result is test code that reads like a spec, not a config file:
 *
 *   // MSW in a React test:
 *   server.use(handlers.documents.withEmpty())
 *
 *   // This file in a Playwright test:
 *   await documentHandlers.withEmpty(page)
 *
 * Usage:
 *   import { documentHandlers, trpcHandlers, apiHandlers } from '../../mocks/handlers';
 *
 *   test('shows empty state', async ({ page }) => {
 *     await documentHandlers.withEmpty(page);
 *     await page.goto('/documents');
 *     // ...
 *   });
 */

import type { Page } from '@playwright/test';
import {
  emptyDocumentList,
  singleDocumentList,
  manyDocumentList,
  allCompletedDocumentList,
  mixedStatusDocumentList,
  longTitleDocumentList,
  specialCharDocumentList,
  edgeDateDocumentList,
  errors,
  trpcErrors,
  type DocumentList,
} from './fixtures';

// ── Types ─────────────────────────────────────────────────────────────────────

type FulfillOptions = {
  status?:      number;
  headers?:     Record<string, string>;
  body?:        string;
  delay?:       number;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

const jsonResponse = (body: unknown, overrides: FulfillOptions = {}): FulfillOptions => ({
  status:      200,
  headers:     { 'Content-Type': 'application/json' },
  body:        JSON.stringify(body),
  ...overrides,
});

const errorResponse = (status: number, body: unknown, extra: FulfillOptions = {}): FulfillOptions =>
  jsonResponse(body, { status, ...extra });

// ── Document list handlers ────────────────────────────────────────────────────

/**
 * Handlers for GET /api/v1/documents
 *
 * Each function applies a route intercept to the page — call BEFORE navigation.
 * Multiple handlers can be applied in sequence; the first matching route wins.
 */
export const documentHandlers = {

  /** Mock a successful list response with custom data */
  withList: (page: Page, data: DocumentList = manyDocumentList) =>
    page.route('**/api/v1/documents**', route =>
      route.fulfill(jsonResponse(data)),
    ),

  /** Empty list — triggers empty state UI */
  withEmpty: (page: Page) =>
    documentHandlers.withList(page, emptyDocumentList),

  /** Single document */
  withSingle: (page: Page) =>
    documentHandlers.withList(page, singleDocumentList),

  /** 50 documents — exercises pagination UI */
  withMany: (page: Page) =>
    documentHandlers.withList(page, manyDocumentList),

  /** All COMPLETED — tests status-filtered views */
  withAllCompleted: (page: Page) =>
    documentHandlers.withList(page, allCompletedDocumentList),

  /** Mixed statuses — full status variety in one response */
  withMixedStatuses: (page: Page) =>
    documentHandlers.withList(page, mixedStatusDocumentList),

  /** Very long document titles — tests truncation / overflow */
  withLongTitles: (page: Page) =>
    documentHandlers.withList(page, longTitleDocumentList),

  /** Special chars and XSS payloads — tests rendering safety */
  withSpecialChars: (page: Page) =>
    documentHandlers.withList(page, specialCharDocumentList),

  /** Boundary dates — oldest / newest documents */
  withEdgeDates: (page: Page) =>
    documentHandlers.withList(page, edgeDateDocumentList),

  // ── Error states ────────────────────────────────────────────────────────────

  with400: (page: Page) =>
    page.route('**/api/v1/documents**', route =>
      route.fulfill(errorResponse(400, errors.badRequest)),
    ),

  with401: (page: Page) =>
    page.route('**/api/v1/documents**', route =>
      route.fulfill(errorResponse(401, errors.unauthorized)),
    ),

  with403: (page: Page) =>
    page.route('**/api/v1/documents**', route =>
      route.fulfill(errorResponse(403, errors.forbidden)),
    ),

  with404: (page: Page) =>
    page.route('**/api/v1/documents**', route =>
      route.fulfill(errorResponse(404, errors.notFound)),
    ),

  with500: (page: Page) =>
    page.route('**/api/v1/documents**', route =>
      route.fulfill(errorResponse(500, errors.internal)),
    ),

  with503: (page: Page) =>
    page.route('**/api/v1/documents**', route =>
      route.fulfill(errorResponse(503, errors.unavailable, {
        headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
      })),
    ),

  with429: (page: Page) =>
    page.route('**/api/v1/documents**', route =>
      route.fulfill(errorResponse(429, errors.rateLimit, {
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
      })),
    ),

  // ── Timing variants ─────────────────────────────────────────────────────────

  /** Artificial delay — simulates slow backend / cold start */
  withDelay: (page: Page, delayMs = 2000, data: DocumentList = manyDocumentList) =>
    page.route('**/api/v1/documents**', route =>
      route.fulfill(jsonResponse(data, { delay: delayMs })),
    ),

  /** Abort — simulates offline / firewall drop */
  withAbort: (page: Page) =>
    page.route('**/api/v1/documents**', route =>
      route.abort('connectionrefused'),
    ),

  // ── Stateful: transient failure then recovery ────────────────────────────────

  /**
   * First call → 500, subsequent calls → 200 with data.
   * Tests whether the UI has automatic retry logic.
   * Returns a counter so the test can inspect retry behaviour.
   */
  withTransientFailure: (page: Page, data: DocumentList = manyDocumentList) => {
    let callCount = 0;
    page.route('**/api/v1/documents**', route => {
      callCount++;
      if (callCount === 1) {
        route.fulfill(errorResponse(500, errors.internal));
      } else {
        route.fulfill(jsonResponse(data));
      }
    });
    return { getCallCount: () => callCount };
  },
};

// ── tRPC handlers (signing flow) ──────────────────────────────────────────────

/**
 * Handlers for /api/trpc/** — used by the signing page and document preview
 */
export const trpcHandlers = {

  with500: (page: Page) =>
    page.route('**/api/trpc/**', route =>
      route.fulfill(errorResponse(500, trpcErrors.internal)),
    ),

  with401: (page: Page) =>
    page.route('**/api/trpc/**', route =>
      route.fulfill(errorResponse(401, trpcErrors.unauthorized)),
    ),

  withNotFound: (page: Page) =>
    page.route('**/api/trpc/**', route =>
      route.fulfill(errorResponse(404, trpcErrors.notFound)),
    ),

  withAbort: (page: Page) =>
    page.route('**/api/trpc/**', route =>
      route.abort('connectionrefused'),
    ),

  withDelay: (page: Page, delayMs = 2000) =>
    page.route('**/api/trpc/**', route =>
      route.fulfill(errorResponse(500, trpcErrors.internal, { delay: delayMs })),
    ),
};

// ── Generic API handlers ──────────────────────────────────────────────────────

/**
 * Broad handlers that intercept ALL API calls.
 * Use sparingly — prefer specific handlers above for targeted tests.
 * These are useful for total-outage simulation.
 */
export const apiHandlers = {

  /** Total outage: every API call returns 503 */
  withTotalOutage: (page: Page) =>
    page.route('**/api/**', route =>
      route.fulfill(errorResponse(503, errors.unavailable, {
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
      })),
    ),

  /** Analytics / tracking blocker — simulates ad blocker */
  withBlockedTracking: (page: Page) => {
    page.route('**/*analytics*', route => route.abort());
    page.route('**/*tracking*',  route => route.abort());
    page.route('**/*telemetry*', route => route.abort());
    page.route('**/*segment*',   route => route.abort());
  },

  /** Allow all requests through (passthrough) — useful as a no-op baseline */
  withPassthrough: (page: Page) =>
    page.route('**/api/**', route => route.continue()),
};
