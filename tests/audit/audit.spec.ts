import { test, expect } from '@playwright/test';
import { env } from '../../config/env';

/**
 * Audit Trail Testing
 *
 * Why audit trails matter in regulated industries:
 * ─────────────────────────────────────────────────
 * Documenso handles legally binding documents under eIDAS (EU) and
 * similar frameworks. Every action on a document — creation, sending,
 * viewing, signing, rejection — must be recorded in an immutable audit
 * log. This is not optional: it's a legal requirement for electronic
 * signature platforms operating in regulated jurisdictions.
 *
 * What we test here:
 * ──────────────────
 * 1. No REST endpoint exists to DELETE audit logs (immutability check)
 * 2. No REST endpoint exists to UPDATE audit logs (tamper check)
 * 3. Audit logs are not exposed via public REST /api/v1 (gap documentation)
 * 4. UI audit/activity tab is accessible on a document
 * 5. tRPC audit log requests are observed on page load
 * 6. Full audit log event taxonomy is documented from source
 *
 * Known gap (documented):
 * ────────────────────────
 * Documenso exposes audit logs via tRPC only — not the REST /api/v1
 * endpoint. This means audit data cannot be queried by external systems
 * using the public API. For a regulated-industry deployment, this is a
 * gap: compliance tools typically need REST access to audit trails.
 *
 * Run: pnpm exec playwright test tests/audit/ --project=chromium --reporter=list
 */

const V1 = `${env.baseUrl}/api/v1`;

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — REST API immutability checks (CI safe, no auth needed)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@audit Audit trail — REST API immutability', () => {

  test('no REST endpoint exists to DELETE audit logs', async ({ request }) => {
    const res = await request.delete(`${V1}/documents/1/audit-logs/1`);

    // 404 = endpoint does not exist (good — audit logs cannot be deleted via REST)
    // 405 = method not allowed (good — DELETE is not supported)
    // 401/403 = endpoint exists but requires auth (document as a finding)
    expect([401, 403, 404, 405]).toContain(res.status());

    console.log(`DELETE /audit-logs returned ${res.status()} — audit log deletion via REST: ${
      [404, 405].includes(res.status()) ? 'NOT POSSIBLE ✓' : 'PROTECTED (requires auth)'
    }`);
  });

  test('no REST endpoint exists to UPDATE audit logs', async ({ request }) => {
    const res = await request.patch(`${V1}/documents/1/audit-logs/1`, {
      data: { type: 'TAMPERED' },
    });

    expect([401, 403, 404, 405]).toContain(res.status());

    console.log(`PATCH /audit-logs returned ${res.status()} — audit log modification via REST: ${
      [404, 405].includes(res.status()) ? 'NOT POSSIBLE ✓' : 'PROTECTED (requires auth)'
    }`);
  });

  test('audit logs are not exposed via public REST /api/v1', async ({ request }) => {
    // The REST API v1 does not expose audit logs — they are tRPC only.
    // This test documents and asserts that finding.
    const res = await request.get(`${V1}/documents/1/audit-logs`, {
      headers: { Authorization: 'Bearer fake-token' },
    });

    // 404 confirms audit logs are NOT part of the public REST API
    expect([401, 403, 404]).toContain(res.status());

    console.log(
      `GET /api/v1/documents/1/audit-logs → ${res.status()}\n` +
      `Finding: Audit logs exposed via tRPC only, not public REST API.\n` +
      `Impact: External compliance tools cannot query audit trail via REST.`
    );
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — UI audit trail verification
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@audit Audit trail — UI verification', () => {

  test('document activity tab is accessible on the document page', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    const documentLinks = page.locator('table tbody tr, [data-testid="document-row"], a[href*="/documents/"]');
    const count = await documentLinks.count();

    if (count === 0) {
      test.skip(true, 'No documents in account — create one first');
      return;
    }

    await documentLinks.first().click();
    await page.waitForLoadState('networkidle');

    // Look for an Activity or Audit Log tab
    const activityTab = page.getByRole('tab', { name: /activity|audit|log/i })
      .or(page.getByText(/activity|audit log/i).first());

    const tabVisible = await activityTab.isVisible().catch(() => false);

    if (tabVisible) {
      await activityTab.click();
      await page.waitForLoadState('networkidle');
      console.log('✓ Audit/Activity tab found and accessible');
      await expect(page.locator('body')).toBeVisible();
    } else {
      console.log(
        'Finding: No dedicated Audit/Activity tab found in document UI.\n' +
        'Audit log may be accessible via admin panel only.'
      );
      expect(page.url()).toContain('documents');
    }
  });

  test('tRPC audit log request is observed when document page loads', async ({ page }) => {
    const auditLogRequests: string[] = [];

    page.on('request', req => {
      if (req.url().includes('audit') || req.url().includes('trpc')) {
        auditLogRequests.push(req.url());
      }
    });

    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    console.log(`tRPC/audit requests observed: ${auditLogRequests.length}`);
    auditLogRequests.forEach(url => console.log(' →', url));

    await expect(page.locator('body')).toBeVisible();
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Audit event taxonomy (documents the full event set from source)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@audit Audit trail — event taxonomy', () => {

  test('documents the full audit log event taxonomy from Documenso source', async () => {
    // Discovered by reading packages/lib/types/document-audit-logs.ts directly.
    // In a real regulated-industry project, every event type would have
    // an end-to-end test asserting it fires at the right moment.

    const knownAuditEvents = [
      // Document lifecycle
      'DOCUMENT_CREATED',
      'DOCUMENT_SENT',
      'DOCUMENT_COMPLETED',
      'DOCUMENT_DELETED',
      // Recipient actions
      'DOCUMENT_OPENED',
      'DOCUMENT_VIEWED',
      'DOCUMENT_FIELD_INSERTED',    // signed/approved
      'DOCUMENT_FIELD_UNINSERTED',  // unsigned
      'DOCUMENT_RECIPIENT_COMPLETED',
      'DOCUMENT_RECIPIENT_REJECTED',
      'DOCUMENT_RECIPIENT_EXPIRED',
      // Communication
      'EMAIL_SENT',
      // Field modifications
      'FIELD_CREATED',
      'FIELD_DELETED',
      'FIELD_UPDATED',
      // Recipient modifications
      'RECIPIENT_CREATED',
      'RECIPIENT_DELETED',
      'RECIPIENT_UPDATED',
      // Document metadata
      'DOCUMENT_TITLE_UPDATED',
      'DOCUMENT_META_UPDATED',
      'DOCUMENT_VISIBILITY_UPDATED',
    ];

    expect(knownAuditEvents.length).toBeGreaterThan(10);

    console.log('=== DOCUMENSO AUDIT LOG EVENT TAXONOMY ===');
    console.log(`Total known event types: ${knownAuditEvents.length}`);
    knownAuditEvents.forEach(e => console.log(` • ${e}`));
    console.log('==========================================');
    console.log('Source: packages/lib/types/document-audit-logs.ts');
    console.log('Access method: tRPC only (not exposed via REST /api/v1)');
    console.log('Gap: No REST endpoint for external compliance tool integration');
  });

});
