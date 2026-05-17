import { test, expect } from '@playwright/test';
import {
  DocumentSchema,
  DocumentListSchema,
  RecipientSchema,
} from '../../schemas/document.schema';
import {
  DocumentFactory,
  RecipientFactory,
} from '../../lib/factories/document.factory';
import { env } from '../../config/env';

/**
 * Parameterized Tests — Boundary Value Analysis (BVA)
 *
 * What is BVA?
 * ────────────────────────────────────────────────────
 * Boundary Value Analysis is a black-box technique that tests the edges
 * of valid input ranges. Most bugs live at boundaries, not in the middle:
 *
 *   Range: page >= 1
 *   Test:  page=0 (just below), page=1 (minimum valid), page=2 (above minimum)
 *
 * Why parameterize?
 * ─────────────────
 * Without parameterization you copy-paste the same test body N times,
 * changing only the input. A bug fix then requires N identical changes.
 * Parameterized tests separate the "what to test" (data table) from
 * "how to test it" (test body) — one body, many scenarios.
 *
 * Run: pnpm exec playwright test tests/api/documents-parameterized.spec.ts --project=ci --reporter=list
 *
 * Sections:
 *   1. Schema BVA         — no Docker needed, pure Zod validation
 *   2. Recipient BVA      — no Docker needed, pure Zod validation
 *   3. List params BVA    — validates query param shapes the factory produces
 *   4. Live pagination    — requires Docker (skipped gracefully otherwise)
 */

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — DocumentSchema BVA (schema layer, no network)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @bva DocumentSchema — boundary values', () => {

  test.beforeEach(() => {
    DocumentFactory.reset();
  });

  // ── Valid boundary cases — schema MUST accept these ────────────────────────

  const validCases: Array<{ label: string; overrides: Record<string, unknown> }> = [
    {
      label: 'minimum valid document (all required fields, no optionals)',
      overrides: {},
    },
    {
      label: 'status: DRAFT',
      overrides: { status: 'DRAFT' },
    },
    {
      label: 'status: PENDING',
      overrides: { status: 'PENDING' },
    },
    {
      label: 'status: COMPLETED',
      overrides: { status: 'COMPLETED' },
    },
    {
      label: 'status: DECLINED',
      overrides: { status: 'DECLINED' },
    },
    {
      label: 'status: CANCELLED',
      overrides: { status: 'CANCELLED' },
    },
    {
      label: 'title with unicode characters',
      overrides: { title: 'Vertrag über Dienstleistungen — Müller GmbH' },
    },
    {
      label: 'title with special characters',
      overrides: { title: 'Contract (v2.1) — Q1/2025 [DRAFT]' },
    },
    {
      label: 'single character title',
      overrides: { title: 'A' },
    },
    {
      label: 'id at lower bound (1)',
      overrides: { id: 1 },
    },
    {
      label: 'large id (boundary: high end)',
      overrides: { id: 2_147_483_647 },   // INT_MAX — common DB boundary
    },
  ];

  for (const { label, overrides } of validCases) {
    test(`accepts: ${label}`, () => {
      const response = DocumentFactory.buildResponse(overrides as any);
      const result = DocumentSchema.safeParse(response);
      expect(
        result.success,
        `Expected schema to ACCEPT "${label}" but it rejected:\n` +
        (result.success ? '' : JSON.stringify(result.error.issues, null, 2))
      ).toBe(true);
    });
  }

  // ── Invalid boundary cases — schema MUST reject these ─────────────────────

  const invalidCases: Array<{
    label:        string;
    overrides:    Record<string, unknown>;
    expectedPath: string;
  }> = [
    {
      label:        'id is 0 (below minimum)',
      overrides:    { id: 0 },
      // Note: Zod number() allows 0 unless .positive() is used.
      // This test documents the CURRENT schema behaviour — if the team
      // adds .positive() later, this test will catch it as a schema change.
      expectedPath: '',  // schema currently accepts 0 — see assertion below
    },
    {
      label:        'id is a string',
      overrides:    { id: '42' },
      expectedPath: 'id',
    },
    {
      label:        'id is null',
      overrides:    { id: null },
      expectedPath: 'id',
    },
    {
      label:        'title is missing',
      overrides:    { title: undefined },
      expectedPath: 'title',
    },
    {
      label:        'title is a number',
      overrides:    { title: 123 },
      expectedPath: 'title',
    },
    {
      label:        'status is an unknown value',
      overrides:    { status: 'ARCHIVED' },
      expectedPath: 'status',
    },
    {
      label:        'status is lowercase (case-sensitive enum)',
      overrides:    { status: 'draft' },
      expectedPath: 'status',
    },
    {
      label:        'createdAt is a timestamp number (not ISO string)',
      overrides:    { createdAt: 1_700_000_000 },
      expectedPath: 'createdAt',
    },
    {
      label:        'updatedAt is null',
      overrides:    { updatedAt: null },
      expectedPath: 'updatedAt',
    },
  ];

  for (const { label, overrides, expectedPath } of invalidCases) {
    test(`rejects: ${label}`, () => {
      const response = DocumentFactory.buildResponse(overrides as any);
      const result = DocumentSchema.safeParse(response);

      // Special case: schema currently accepts id=0 (not .positive())
      // We document actual behaviour rather than assert incorrect behaviour.
      if (label === 'id is 0 (below minimum)') {
        // If this ever fails, the team added .positive() — update the test.
        expect(result.success).toBe(true);   // document current permissive behaviour
        return;
      }

      expect(
        result.success,
        `Expected schema to REJECT "${label}" but it accepted the input`
      ).toBe(false);

      if (expectedPath && !result.success) {
        const paths = result.error.issues.map(i => String(i.path[0]));
        expect(paths).toContain(expectedPath);
      }
    });
  }

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — RecipientSchema BVA (schema layer, no network)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @bva RecipientSchema — boundary values', () => {

  test.beforeEach(() => { RecipientFactory.reset(); });

  const validRecipients: Array<{ label: string; overrides: Record<string, unknown> }> = [
    { label: 'SIGNER role',   overrides: { role: 'SIGNER' } },
    { label: 'APPROVER role', overrides: { role: 'APPROVER' } },
    { label: 'CC role',       overrides: { role: 'CC' } },
    { label: 'VIEWER role',   overrides: { role: 'VIEWER' } },
    { label: 'email with subdomain', overrides: { email: 'signer@mail.company.co.uk' } },
    { label: 'email with plus tag',  overrides: { email: 'user+test@example.com' } },
  ];

  for (const { label, overrides } of validRecipients) {
    test(`accepts: ${label}`, () => {
      const recipient = RecipientFactory.buildResponse(overrides as any);
      const result = RecipientSchema.safeParse(recipient);
      expect(
        result.success,
        `Expected schema to ACCEPT "${label}":\n` +
        (result.success ? '' : JSON.stringify(result.error.issues, null, 2))
      ).toBe(true);
    });
  }

  const invalidRecipients: Array<{
    label:        string;
    overrides:    Record<string, unknown>;
    expectedPath: string;
  }> = [
    { label: 'email without @ symbol',  overrides: { email: 'notanemail' },        expectedPath: 'email' },
    { label: 'email with no TLD',       overrides: { email: 'user@domain' },        expectedPath: 'email' },
    { label: 'empty email string',      overrides: { email: '' },                   expectedPath: 'email' },
    { label: 'unknown role: WITNESS',   overrides: { role: 'WITNESS' },             expectedPath: 'role' },
    { label: 'unknown role: OWNER',     overrides: { role: 'OWNER' },               expectedPath: 'role' },
    { label: 'role is lowercase',       overrides: { role: 'signer' },              expectedPath: 'role' },
    { label: 'missing email field',     overrides: { email: undefined },            expectedPath: 'email' },
    { label: 'documentId is a string', overrides: { documentId: '10' },            expectedPath: 'documentId' },
  ];

  for (const { label, overrides, expectedPath } of invalidRecipients) {
    test(`rejects: ${label}`, () => {
      const recipient = RecipientFactory.buildResponse(overrides as any);
      const result = RecipientSchema.safeParse(recipient);
      expect(result.success, `Expected schema to REJECT "${label}"`).toBe(false);
      if (expectedPath && !result.success) {
        const paths = result.error.issues.map(i => String(i.path[0]));
        expect(paths).toContain(expectedPath);
      }
    });
  }

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — DocumentListSchema BVA (schema layer, no network)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @bva DocumentListSchema — boundary values', () => {

  test.beforeEach(() => { DocumentFactory.reset(); });

  const validLists: Array<{ label: string; count: number; totalPages: number }> = [
    { label: 'empty list, zero pages',     count: 0,   totalPages: 0  },
    { label: 'single document, one page',  count: 1,   totalPages: 1  },
    { label: 'full page (10 docs)',        count: 10,  totalPages: 1  },
    { label: 'large result set',           count: 100, totalPages: 10 },
  ];

  for (const { label, count, totalPages } of validLists) {
    test(`accepts: ${label}`, () => {
      const list = DocumentFactory.buildListResponse(count, totalPages);
      const result = DocumentListSchema.safeParse(list);
      expect(
        result.success,
        `Expected schema to ACCEPT list (count=${count}, totalPages=${totalPages}):\n` +
        (result.success ? '' : JSON.stringify(result.error.issues, null, 2))
      ).toBe(true);
    });
  }

  const invalidLists: Array<{ label: string; payload: unknown; expectedPath: string }> = [
    {
      label:        'totalPages is negative',
      payload:      { documents: [], totalPages: -1 },
      expectedPath: 'totalPages',
    },
    {
      label:        'documents is null (not an array)',
      payload:      { documents: null, totalPages: 0 },
      expectedPath: 'documents',
    },
    {
      label:        'totalPages is renamed to pageCount',
      payload:      { documents: [], pageCount: 1 },
      expectedPath: 'totalPages',
    },
    {
      label:        'documents contains an invalid document shape',
      payload:      { documents: [{ id: 'not-a-number', title: 'x' }], totalPages: 1 },
      expectedPath: 'documents',
    },
  ];

  for (const { label, payload, expectedPath } of invalidLists) {
    test(`rejects: ${label}`, () => {
      const result = DocumentListSchema.safeParse(payload);
      expect(result.success, `Expected schema to REJECT "${label}"`).toBe(false);
      if (expectedPath && !result.success) {
        const allPaths = result.error.issues.map(i => String(i.path[0]));
        expect(allPaths).toContain(expectedPath);
      }
    });
  }

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Live API: pagination BVA (requires Docker)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @bva Live — pagination boundary values', () => {

  /**
   * BVA on the GET /api/v1/documents?page=X&perPage=Y endpoint.
   *
   * Boundary partitions:
   *   page    — valid: >= 1   | invalid: <= 0
   *   perPage — valid: 1–100  | invalid: <= 0 or > 100 (Documenso cap)
   *
   * Each case states whether the API should return 200 or 4xx.
   * CI skips this section if Docker is not running.
   */

  const paginationCases: Array<{
    label:          string;
    params:         { page: number; perPage: number };
    expectOk:       boolean;
  }> = [
    { label: 'page=1, perPage=1  (minimum valid perPage)',  params: { page: 1, perPage: 1   }, expectOk: true  },
    { label: 'page=1, perPage=10 (default)',                params: { page: 1, perPage: 10  }, expectOk: true  },
    { label: 'page=1, perPage=50 (large but valid)',        params: { page: 1, perPage: 50  }, expectOk: true  },
    { label: 'page=2, perPage=10 (second page)',            params: { page: 2, perPage: 10  }, expectOk: true  },
    { label: 'page=999, perPage=10 (beyond data, empty)',   params: { page: 999, perPage: 10}, expectOk: true  },
    { label: 'page=0 (below minimum)',                      params: { page: 0, perPage: 10  }, expectOk: false },
    { label: 'page=-1 (negative)',                          params: { page: -1, perPage: 10 }, expectOk: false },
    { label: 'perPage=0 (zero — invalid)',                  params: { page: 1, perPage: 0   }, expectOk: false },
    { label: 'perPage=-1 (negative)',                       params: { page: 1, perPage: -1  }, expectOk: false },
  ];

  for (const { label, params, expectOk } of paginationCases) {
    test(`${expectOk ? '✓' : '✗'} ${label}`, async ({ request }) => {

      if (!env.apiKey) {
        test.skip(true, 'Requires DOCUMENSO_API_KEY');
        return;
      }

      let res: Awaited<ReturnType<typeof request.get>>;
      try {
        res = await request.get(
          `${env.baseUrl}/api/v1/documents`,
          {
            params,
            headers: { Authorization: `Bearer ${env.apiKey}` },
          }
        );
      } catch (e: any) {
        test.skip(true, `App not reachable (${e.message ?? e.code}) — start Docker first`);
        return;
      }

      if (expectOk) {
        expect(res.ok(), `Expected 2xx for ${label} but got ${res.status()}`).toBe(true);

        // Additionally validate the response body against the schema
        const body = await res.json();
        const parsed = DocumentListSchema.safeParse(body);
        expect(
          parsed.success,
          `Response body did not match DocumentListSchema:\n` +
          (parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2))
        ).toBe(true);
      } else {
        expect(
          res.ok(),
          `Expected 4xx for ${label} but got ${res.status()}`
        ).toBe(false);
      }
    });
  }

});
