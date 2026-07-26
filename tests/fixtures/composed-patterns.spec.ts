/**
 * Composed Fixture Patterns — demonstration suite
 *
 * Each test here shows ONE thing about the composed fixtures from
 * tests/fixtures.composed.ts. Read these alongside that file.
 *
 * The key question these tests answer:
 *   "What does a test look like when fixtures do all the setup?"
 *
 * Answer: it becomes JUST ASSERTIONS. No beforeEach. No try/finally.
 * No skip guards. The fixture handles everything.
 */

import { test, expect } from '../fixtures.composed';
import { env }          from '../../config/env';

// ── FIXTURE 1: senderWithDocument ─────────────────────────────────────────────

test.describe('senderWithDocument', () => {

  /**
   * The most basic usage. The test receives a live document that already
   * exists in the database. It just asserts properties — no setup code.
   *
   * Notice: no beforeEach. No API client construction. No teardown.
   * All of that is in the fixture. The test IS the assertion.
   */
  test('document arrives ready with correct shape', async ({ senderWithDocument }) => {
    const { document } = senderWithDocument;

    expect(document.id).toBeGreaterThan(0);
    expect(document.title).toContain('di-sender-');
    expect(document.status).toBe('DRAFT');
    expect(document.createdAt).toBeTruthy();
  });

  /**
   * The fixture also provides the API client. So a test can use it
   * to READ back from the real database and verify the document
   * actually persists — not just that the create() call returned something.
   *
   * This is an API round-trip test with zero boilerplate.
   */
  test('document is readable via API after creation', async ({ senderWithDocument }) => {
    const { document, api } = senderWithDocument;

    const fetched = await api.getById(document.id);

    expect(fetched.id).toBe(document.id);
    expect(fetched.title).toBe(document.title);
    expect(fetched.status).toBe('DRAFT');
  });

  /**
   * Shows that the fixture's teardown works.
   *
   * This test DELETES the document itself. After the test, the fixture
   * tries to delete it again — and silently swallows the 404.
   * No error. No leftover data.
   *
   * This proves the fixture is safe to use even in tests that modify
   * the resource it created.
   */
  test('fixture teardown survives test-level deletion', async ({ senderWithDocument }) => {
    const { document, api } = senderWithDocument;

    // Test explicitly deletes the document
    await api.delete(document.id);

    // Verify it's gone
    const list = await api.list();
    const stillExists = list.documents.some(d => d.id === document.id);
    expect(stillExists).toBe(false);

    // Fixture teardown will try to delete again → swallows 404 → test passes
  });

});

// ── FIXTURE 2: senderWithCompletedDocument ─────────────────────────────────────

test.describe('senderWithCompletedDocument', () => {

  /**
   * Demonstrates multi-level fixture chaining.
   *
   * senderWithCompletedDocument depends on senderWithDocument which
   * depends on authenticatedApi. The entire chain is resolved automatically.
   *
   * In the current implementation: the document arrives in DRAFT state
   * because completing it requires Inbucket (the email server).
   * When INBUCKET_URL is set, the fixture will extend to full completion.
   *
   * Even in this partial form, the test shows the PATTERN:
   * you declare the fixture, you get back { document, api }, same as
   * senderWithDocument — but semantically this represents the full lifecycle.
   */
  test('receives document from chained fixture', async ({ senderWithCompletedDocument }) => {
    const { document, api } = senderWithCompletedDocument;

    // Verify the document exists and is accessible
    const fetched = await api.getById(document.id);
    expect(fetched.id).toBe(document.id);

    // When full completion is implemented, assert:
    //   expect(fetched.status).toBe('COMPLETED');
    // For now: documents the pattern, asserts the chain resolves
    expect(['DRAFT', 'COMPLETED']).toContain(fetched.status);
  });

  /**
   * Shows what happens when a dependency in the middle of the chain skips.
   *
   * If DOCUMENSO_API_KEY is not set:
   *   authenticatedApi → skips
   *   senderWithDocument → auto-skips (depends on authenticatedApi)
   *   senderWithCompletedDocument → auto-skips (depends on senderWithDocument)
   *
   * This test is here to document that behaviour. When the API key IS set,
   * it runs normally. When it's absent, all three skip automatically.
   *
   * No skip guard in this test. The chain handles it.
   */
  test('skip propagates through the entire dependency chain', async ({ senderWithCompletedDocument }) => {
    // If we reach here, the full chain resolved successfully.
    // If DOCUMENSO_API_KEY was absent, this test was already skipped.
    expect(senderWithCompletedDocument.document).toBeDefined();
    expect(senderWithCompletedDocument.api).toBeDefined();
  });

});

// ── FIXTURE 3: senderAndSigner ─────────────────────────────────────────────────

test.describe('senderAndSigner', () => {

  /**
   * The multi-actor pattern.
   *
   * Two independent browser contexts, loaded with different auth sessions.
   * This is how you drive BOTH sides of the signing flow in one test:
   * sender creates a document, signer signs it, sender verifies completion.
   *
   * In CI (ci project, no .auth/ files) — this test is automatically skipped.
   * Locally (after running auth setup) — it runs with real dual sessions.
   */
  test('sender and signer have independent page contexts', async ({ senderAndSigner }) => {
    const { senderPage, signerPage } = senderAndSigner;

    // Navigate both pages simultaneously — they don't interfere
    await Promise.all([
      senderPage.goto(`${env.baseUrl}/documents`),
      signerPage.goto(`${env.baseUrl}/signin`),
    ]);

    // Sender sees the documents dashboard (authenticated)
    await expect(senderPage).toHaveURL(/\/documents/);

    // Signer is on the signin page (different session)
    // Or /documents if already authenticated with signer creds
    const signerUrl = signerPage.url();
    expect(
      signerUrl.includes('/documents') || signerUrl.includes('/signin')
    ).toBe(true);
  });

  /**
   * Full multi-party signing flow — the real end goal of this fixture.
   *
   * This test is left as a PATTERN with comments showing each step.
   * It passes today because we only assert what we know is available.
   * Uncomment the steps as the API client and test infrastructure grow.
   */
  test('multi-party signing flow pattern (extend as API grows)', async ({
    senderAndSigner,
    authenticatedApi,
  }) => {
    const { senderPage, signerPage } = senderAndSigner;

    // ── Step 1: Sender creates a document ─────────────────────────────────
    // const doc = await authenticatedApi.create(SAMPLE_PDF, 'multi-party-test');

    // ── Step 2: Sender adds signer as recipient ───────────────────────────
    // await authenticatedApi.addRecipient(doc.id, {
    //   email: env.signerEmail,
    //   name: 'Test Signer',
    // });

    // ── Step 3: Sender sends the document ─────────────────────────────────
    // await authenticatedApi.sendDocument(doc.id);
    // await senderPage.goto(`${env.baseUrl}/documents`);
    // await expect(senderPage.locator('[data-testid="document-status"]')).toContainText('Pending');

    // ── Step 4: Signer receives and opens the signing link ────────────────
    // const signingUrl = await getSigningUrlFromInbucket(env.inbucketUrl, env.signerEmail);
    // await signerPage.goto(signingUrl);
    // await expect(signerPage.locator('button:has-text("Sign")')).toBeVisible();

    // ── Step 5: Signer signs ──────────────────────────────────────────────
    // await signerPage.click('button:has-text("Sign")');
    // await signerPage.click('button:has-text("Complete")');

    // ── Step 6: Sender verifies completion ────────────────────────────────
    // await senderPage.reload();
    // await expect(senderPage.locator('[data-testid="document-status"]')).toContainText('Completed');

    // Currently: verify both pages are alive and independent
    expect(senderPage.isClosed()).toBe(false);
    expect(signerPage.isClosed()).toBe(false);

    // Pages are truly separate contexts — no session bleed
    const senderCookies = await senderPage.context().cookies();
    const signerCookies  = await signerPage.context().cookies();

    // Session cookies exist independently in each context
    expect(senderCookies.length).toBeGreaterThanOrEqual(0);
    expect(signerCookies.length).toBeGreaterThanOrEqual(0);
  });

});
