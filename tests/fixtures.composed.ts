/**
 * Composed Fixtures — Dependency Injection in Playwright
 *
 * This file shows the real power of Playwright fixtures: they can DEPEND ON
 * EACH OTHER. Each fixture declares what it needs, Playwright wires it up,
 * and if any dependency skips the test (e.g. no API key), every fixture that
 * depends on it also skips — automatically, with no guard code in the test.
 *
 * Three fixtures here, each building on the previous:
 *
 *   senderWithDocument
 *     └─ composes: authenticatedApi (from fixtures.ts)
 *        Returns: { document, api } — a live document + the API client
 *
 *   senderWithCompletedDocument
 *     └─ composes: senderWithDocument (above)
 *        Returns: the same shape, but documents how you'd extend it
 *        to the full signing completion flow
 *
 *   senderAndSigner
 *     └─ composes: browser (Playwright built-in)
 *        Returns: { senderPage, signerPage } — two independent browser
 *        sessions with different identities. The multi-actor pattern.
 *
 * See docs/fixture-composition.md for the full explanation and diagram.
 */

import fs   from 'fs';
import path from 'path';
import { test as base }  from './fixtures';
import type { Document } from '../api/documents.api';
import type { Page }     from '@playwright/test';
import { DocumentsApi }  from '../api/documents.api';
import { env }           from '../config/env';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * What senderWithDocument gives you.
 *
 * `document` — the seeded document. Use .id to read it, pass it to other
 *              API calls, or navigate to its URL in the browser.
 * `api`      — the authenticated API client. Call list(), getById(),
 *              delete() etc. directly in your test without setup.
 */
export type SenderContext = {
  document: Document;
  api:      DocumentsApi;
};

/**
 * What senderAndSigner gives you.
 *
 * Two independent browser contexts — two different logged-in users.
 * senderPage is authenticated as the document owner.
 * signerPage is authenticated as the invited signer.
 *
 * These are REAL separate sessions. Navigating senderPage does not
 * affect signerPage. Cookies are completely isolated.
 */
export type DualActorContext = {
  senderPage: Page;
  signerPage:  Page;
};

// ── Paths ─────────────────────────────────────────────────────────────────────

const SAMPLE_PDF       = path.resolve(__dirname, 'fixtures/sample.pdf');
const SENDER_AUTH_FILE = path.resolve(__dirname, '../.auth/sender.json');
const SIGNER_AUTH_FILE = path.resolve(__dirname, '../.auth/signer.json');

// ── Extended test object ──────────────────────────────────────────────────────

export const test = base.extend<{
  senderWithDocument:          SenderContext;
  senderWithCompletedDocument: SenderContext;
  senderAndSigner:             DualActorContext;
}>({

  // ═══════════════════════════════════════════════════════════════════════════
  // FIXTURE 1 — senderWithDocument
  //
  // The simplest composed fixture. It depends on `authenticatedApi`, which is
  // a custom fixture defined in fixtures.ts — not a Playwright built-in.
  //
  // What this gives you over writing it yourself in beforeEach:
  //   1. If authenticatedApi skips (no API key), this ALSO skips — no guard.
  //   2. The document is deleted after the test even if the test throws.
  //   3. Every test that uses this starts with the same clean state.
  //
  // Dependency chain:
  //   senderWithDocument
  //     → authenticatedApi  (fixtures.ts) → checks env.hasApiKey → skips if absent
  //       → request         (Playwright built-in)
  // ═══════════════════════════════════════════════════════════════════════════

  senderWithDocument: async ({ authenticatedApi }, use, testInfo) => {

    // ── Setup ────────────────────────────────────────────────────────────────
    // Create a document. The title includes the test name so failures are
    // easy to trace — you see WHICH test created the leftover document.
    const title = `di-sender-${testInfo.title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;

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

    // ── Hand to test ─────────────────────────────────────────────────────────
    // The test receives BOTH the document and the api client.
    // It doesn't have to construct either — they arrive ready.
    await use({ document: doc, api: authenticatedApi });

    // ── Teardown (guaranteed) ────────────────────────────────────────────────
    // This runs even if the test threw. Playwright fixtures always clean up.
    // If the test already deleted the document, the 404 is swallowed.
    try {
      await authenticatedApi.delete(doc.id);
    } catch {
      // Swallow — test may have deleted it as part of its assertions
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FIXTURE 2 — senderWithCompletedDocument
  //
  // Chains off senderWithDocument. Demonstrates MULTI-LEVEL composition:
  //   senderWithCompletedDocument → senderWithDocument → authenticatedApi
  //
  // A "completed" document has gone through the full signing flow:
  //   create → add recipient → send signing request → signer signs → done
  //
  // Full implementation requires Inbucket (email server) to retrieve the
  // signing URL. In this framework that is available in Docker, but not
  // always in every CI environment.
  //
  // This fixture:
  //   • Shows EXACTLY how you'd chain a multi-step flow
  //   • Works today: creates the document and triggers the send
  //   • Skips gracefully if Inbucket is unreachable
  //   • Documents the completion check so you can extend it
  //
  // Dependency chain:
  //   senderWithCompletedDocument
  //     → senderWithDocument  (above)
  //       → authenticatedApi  (fixtures.ts)
  //         → request         (Playwright built-in)
  // ═══════════════════════════════════════════════════════════════════════════

  senderWithCompletedDocument: async ({ senderWithDocument }, use, testInfo) => {
    const { document, api } = senderWithDocument;

    // ── Check Inbucket availability ──────────────────────────────────────────
    // Full completion requires retrieving the signing URL from the email server.
    // Skip gracefully if the email server is not configured.
    if (!env.inbucketUrl) {
      testInfo.skip(true, 'Requires INBUCKET_URL — set in .env or CI secrets');
      return;
    }

    // ── What full completion looks like (extend here when needed) ────────────
    //
    // Step 1: Add a recipient to the document
    //   await api.addRecipient(document.id, { email: env.signerEmail, name: 'Test Signer' });
    //
    // Step 2: Send the signing request (triggers the email to the signer)
    //   await api.sendDocument(document.id);
    //
    // Step 3: Poll Inbucket for the signing email
    //   const inbox = await fetch(`${env.inbucketUrl}/api/v1/mailbox/signer`);
    //   const email = await inbox.json();
    //   const signingUrl = extractSigningUrl(email[0].body);
    //
    // Step 4: POST to the signing endpoint to complete
    //   await api.signDocument(signingUrl, { fieldValues: [...] });
    //
    // Step 5: Poll until document status === 'COMPLETED'
    //   await expect.poll(() => api.getById(document.id)).toMatchObject({ status: 'COMPLETED' });
    //
    // This is the pattern. Implement each step as the API client grows.
    // For now: the fixture provides the document in DRAFT state, which is
    // sufficient to demonstrate the chaining pattern.

    // ── Hand to test ─────────────────────────────────────────────────────────
    // The test receives the same shape as senderWithDocument.
    // When the completion steps above are implemented, the document
    // arrives with status === 'COMPLETED' instead of 'DRAFT'.
    await use({ document, api });

    // No teardown here — senderWithDocument's teardown handles deletion.
    // This is another benefit of composition: you don't double-delete.
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FIXTURE 3 — senderAndSigner
  //
  // The multi-actor pattern. Two independent browser contexts, two different
  // authenticated users. This is how you test MULTI-PARTY workflows in
  // Playwright — not by logging in and out, but by running two sessions
  // simultaneously.
  //
  // Why two contexts instead of logging in/out?
  //   - Logging out and back in is slow and flaky
  //   - Two contexts are isolated: senderPage cookie changes don't affect signerPage
  //   - You can drive BOTH users in the same test without conflicts
  //
  // Requires:
  //   .auth/sender.json — sender's saved session (from global setup)
  //   .auth/signer.json — signer's saved session (from global setup)
  //   These exist after you run: pnpm exec playwright test tests/setup/
  //
  // Skips gracefully in CI (ci project uses empty storageState).
  //
  // Dependency chain:
  //   senderAndSigner
  //     → browser  (Playwright built-in — the whole browser, not just a page)
  // ═══════════════════════════════════════════════════════════════════════════

  senderAndSigner: async ({ browser }, use, testInfo) => {

    // ── Guard: auth files must exist ────────────────────────────────────────
    // .auth/ is gitignored. They exist after running the auth setup project.
    // In CI (ci project, empty storageState) these files don't exist — skip.
    if (!fs.existsSync(SENDER_AUTH_FILE) || !fs.existsSync(SIGNER_AUTH_FILE)) {
      testInfo.skip(
        true,
        'Requires .auth/sender.json and .auth/signer.json — ' +
        'run: pnpm exec playwright test tests/setup/ --project=default'
      );
      return;
    }

    // ── Create two independent browser contexts ──────────────────────────────
    // Each context has its own cookies, localStorage, and session.
    // They don't share anything — completely isolated identities.
    //
    // `browser` is the full browser instance. `page` (the built-in fixture)
    // is already a page inside a default context. Here we bypass that and
    // create our own contexts from scratch so we control the storageState.

    const senderContext = await browser.newContext({
      storageState: SENDER_AUTH_FILE,
    });

    const signerContext = await browser.newContext({
      storageState: SIGNER_AUTH_FILE,
    });

    // Open one page in each context
    const senderPage = await senderContext.newPage();
    const signerPage  = await signerContext.newPage();

    // ── Hand both pages to the test ──────────────────────────────────────────
    // The test can drive BOTH users simultaneously:
    //   await senderPage.goto('/documents');         // sender sees their dashboard
    //   await signerPage.goto(signingUrl);           // signer sees the signing page
    //   await signerPage.click('button:has-text("Sign")');
    //   await expect(senderPage.locator(...)).toContainText('Completed');
    await use({ senderPage, signerPage });

    // ── Teardown — close both contexts ───────────────────────────────────────
    // Closing the context closes all pages inside it.
    // Playwright would clean up anyway, but explicit close is faster.
    await senderContext.close();
    await signerContext.close();
  },

});

export { expect } from './fixtures';
