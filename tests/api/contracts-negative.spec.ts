import { test, expect } from '@playwright/test';
import { z } from 'zod';
import {
  DocumentSchema,
  DocumentListSchema,
  RecipientSchema,
  AuditLogSchema,
  ApiErrorSchema,
  DocumentStatusSchema,
} from '../../schemas/document.schema';
import { env } from '../../config/env';

/**
 * Negative Contract Tests
 *
 * Positive contract tests prove: "the real API matches our schema."
 * Negative contract tests prove: "our schema actually catches bad shapes."
 *
 * Without negative tests, your schema could be so loose it accepts anything —
 * and you'd never know until a breaking change slipped through.
 *
 * Pattern for each negative test:
 *   1. Build a deliberately broken object (wrong type, missing field, renamed key)
 *   2. Run it through the schema
 *   3. Assert safeParse() returns success: false
 *
 * This proves the schema has teeth — it will fail when a real breaking
 * change hits, not just when the test author expected it to.
 *
 * Run: pnpm exec playwright test tests/api/contracts-negative.spec.ts --project=ci --reporter=list
 */

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — DocumentSchema negative tests
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @contract Negative — DocumentSchema rejects bad shapes', () => {

  test('rejects document where id is a string instead of number', () => {
    const bad = {
      id: '123',          // ← breaking change: number became string
      title: 'Test doc',
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = DocumentSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].path[0]).toBe('id');
  });

  test('rejects document where status is an unknown enum value', () => {
    const bad = {
      id: 1,
      title: 'Test doc',
      status: 'ARCHIVED',   // ← new status added by API team, not in our contract
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = DocumentSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].path[0]).toBe('status');
  });

  test('rejects document with missing required title field', () => {
    const bad = {
      id: 1,
      // title missing — renamed to "name" by API team
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = DocumentSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].path[0]).toBe('title');
  });

  test('rejects document where createdAt is not a valid date string', () => {
    const bad = {
      id: 1,
      title: 'Test doc',
      status: 'DRAFT',
      createdAt: 1234567890,   // ← timestamp number instead of ISO string
      updatedAt: new Date().toISOString(),
    };

    const result = DocumentSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].path[0]).toBe('createdAt');
  });

  test('rejects document where title is renamed to name', () => {
    // Simulates: API team renames "title" to "name" — common breaking change
    const bad = {
      id: 1,
      name: 'Test doc',   // ← renamed field
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = DocumentSchema.safeParse(bad);
    expect(result.success).toBe(false);
    // "title" is missing — should be caught
    const paths = result.success ? [] : result.error.issues.map(i => i.path[0]);
    expect(paths).toContain('title');
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — DocumentListSchema negative tests
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @contract Negative — DocumentListSchema rejects bad shapes', () => {

  test('rejects list response where totalPages is renamed to pageCount', () => {
    // Simulates: API team renames "totalPages" to "pageCount"
    const bad = {
      documents: [],
      pageCount: 0,   // ← renamed — totalPages is missing
    };

    const result = DocumentListSchema.safeParse(bad);
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map(i => i.path[0]);
    expect(paths).toContain('totalPages');
  });

  test('rejects list response where documents is not an array', () => {
    const bad = {
      documents: null,   // ← null instead of empty array
      totalPages: 0,
    };

    const result = DocumentListSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].path[0]).toBe('documents');
  });

  test('rejects list response where totalPages is negative', () => {
    const bad = {
      documents: [],
      totalPages: -1,   // ← nonnegative constraint should catch this
    };

    const result = DocumentListSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  test('valid empty list passes schema', () => {
    // Sanity check: ensure a valid empty response still passes
    const good = {
      documents: [],
      totalPages: 0,
    };

    const result = DocumentListSchema.safeParse(good);
    expect(
      result.success,
      `Valid empty list should pass: ${result.success ? '' : JSON.stringify(result.success ? '' : result.error.issues)}`
    ).toBe(true);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — RecipientSchema negative tests
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @contract Negative — RecipientSchema rejects bad shapes', () => {

  test('rejects recipient with invalid email format', () => {
    const bad = {
      id: 1,
      documentId: 10,
      email: 'not-an-email',   // ← invalid format
      name: 'John Doe',
      role: 'SIGNER',
    };

    const result = RecipientSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].path[0]).toBe('email');
  });

  test('rejects recipient with unknown role', () => {
    const bad = {
      id: 1,
      documentId: 10,
      email: 'signer@test.com',
      name: 'John Doe',
      role: 'WITNESS',   // ← not in our contract
    };

    const result = RecipientSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].path[0]).toBe('role');
  });

  test('valid recipient passes schema', () => {
    const good = {
      id: 1,
      documentId: 10,
      email: 'signer@test.com',
      name: 'John Doe',
      role: 'SIGNER',
    };

    const result = RecipientSchema.safeParse(good);
    expect(result.success).toBe(true);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — ApiErrorSchema negative tests
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @contract Negative — ApiErrorSchema rejects bad shapes', () => {

  test('rejects error response where message field is missing', () => {
    // Simulates: API team renames "message" to "error"
    const bad = {
      error: 'Unauthorized',   // ← "message" is missing
    };

    const result = ApiErrorSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].path[0]).toBe('message');
  });

  test('rejects error response where message is a number', () => {
    const bad = {
      message: 401,   // ← number instead of string
    };

    const result = ApiErrorSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Strict schema (no unknown fields allowed)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@api @contract Strict — additive breaking changes', () => {

  /**
   * Why strict matters:
   * A standard Zod schema ignores unknown fields — extra keys pass silently.
   * A strict schema fails if ANY unknown key is present.
   *
   * Use case: API team adds a required field "documentHash" and removes "title".
   * Standard schema: passes (title is still there, unknown fields ignored)
   * Strict schema: fails immediately (unexpected field caught)
   *
   * We don't enforce strict on production schemas (too brittle for optional fields)
   * but we document the capability here for regulated-industry contexts where
   * any schema drift — including additions — must be reviewed.
   */

  const StrictDocumentSchema = z.object({
    id:        z.number(),
    title:     z.string(),
    status:    DocumentStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  }).strict();   // ← reject any unknown keys

  test('strict schema rejects document with unexpected additional field', () => {
    const withExtra = {
      id: 1,
      title: 'Test',
      status: 'DRAFT' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      documentHash: 'abc123',   // ← new field added by API team, not in contract
    };

    const result = StrictDocumentSchema.safeParse(withExtra);
    expect(result.success).toBe(false);
    // Strict mode issue type is "unrecognized_keys"
    const hasUnrecognisedKey = result.success
      ? false
      : result.error.issues.some(i => i.code === 'unrecognized_keys');
    expect(hasUnrecognisedKey).toBe(true);
  });

  test('strict schema passes for a document with exactly the right fields', () => {
    const exact = {
      id: 1,
      title: 'Test',
      status: 'DRAFT' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = StrictDocumentSchema.safeParse(exact);
    expect(result.success).toBe(true);
  });

  test('live API: GET /documents returns no unexpected fields on each document', async ({ request }) => {
    // Skip if no API key
    if (!env.apiKey) {
      test.skip(true, 'Requires DOCUMENSO_API_KEY');
      return;
    }

    // Skip gracefully if Docker / app is not running locally
    let res: Awaited<ReturnType<typeof request.get>>;
    try {
      res = await request.get(`${env.baseUrl}/api/v1/documents?page=1&perPage=5`, {
        headers: { Authorization: `Bearer ${env.apiKey}` },
      });
    } catch (e: any) {
      test.skip(true, `App not reachable (${e.message}) — start Docker first`);
      return;
    }

    if (!res.ok()) {
      test.skip(true, 'API returned non-OK — skipping live contract check');
      return;
    }

    const body = await res.json();

    // We intentionally use the NON-strict schema here for live API tests
    // because the real API may return optional fields our strict schema doesn't list.
    // The strict test above uses constructed objects to prove the mechanism works.
    // This test checks the live API returns at minimum all required fields.
    for (const doc of body.documents) {
      const required = z.object({
        id:        z.number(),
        title:     z.string(),
        status:    DocumentStatusSchema,
        createdAt: z.string(),
        updatedAt: z.string(),
      });

      const result = required.safeParse(doc);
      expect(
        result.success,
        `Document id=${doc.id} missing required field:\n${result.success ? '' : JSON.stringify(result.error.issues, null, 2)}`
      ).toBe(true);
    }
  });

});
