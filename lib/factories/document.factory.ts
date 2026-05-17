import { z } from 'zod';
import {
  DocumentSchema,
  DocumentListSchema,
  RecipientSchema,
  DocumentStatusSchema,
  RecipientRoleSchema,
} from '../../schemas/document.schema';

/**
 * Document Test Data Factory
 *
 * Why factories instead of hardcoded objects?
 * ────────────────────────────────────────────
 * Hardcoded test data causes two problems:
 *   1. Copy-paste drift — three tests share the same object literal and
 *      a field rename breaks all three simultaneously.
 *   2. Invisible coupling — test A creates document with id=1, test B
 *      assumes no document with id=1 exists. Factories make ownership explicit.
 *
 * The factory pattern (also called "object mother") gives every test a
 * fresh, valid baseline in one call:
 *
 *   const doc = DocumentFactory.build();                   // all defaults
 *   const doc = DocumentFactory.build({ title: 'GDPR' }); // one override
 *
 * This is standard at Atlassian, Monzo, and most regulated-industry
 * engineering teams — interviewers expect you to know it.
 *
 * Type safety:
 *   Every factory method returns an inferred Zod type. If the schema changes,
 *   TypeScript surfaces every broken factory call at compile time.
 */

// ── Exported types (inferred from schemas so they stay in sync) ───────────────

export type DocumentPayload = z.infer<typeof DocumentSchema>;
export type RecipientPayload = z.infer<typeof RecipientSchema>;
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;
export type RecipientRole = z.infer<typeof RecipientRoleSchema>;

// ── Shared input types (what you pass TO the API, not what it returns) ────────

export interface CreateDocumentInput {
  title:   string;
  message?: string;
}

export interface CreateRecipientInput {
  name:  string;
  email: string;
  role:  RecipientRole;
}

export interface ListParams {
  page:    number;
  perPage: number;
  status?: DocumentStatus;
}

// ── Counter — gives every factory call a unique, deterministic suffix ─────────
// Reset between test suites if you need isolation.
let _seq = 0;
const next = () => ++_seq;

// ═════════════════════════════════════════════════════════════════════════════
// DocumentFactory
// ═════════════════════════════════════════════════════════════════════════════

export const DocumentFactory = {

  /** Reset the sequence counter. Call in beforeEach for strict isolation. */
  reset(): void { _seq = 0; },

  // ── API input builders ───────────────────────────────────────────────────

  /**
   * Build a valid CreateDocument request body.
   * Override only the fields relevant to the test.
   *
   * @example
   *   DocumentFactory.buildInput()                        // defaults
   *   DocumentFactory.buildInput({ title: '' })           // BVA: empty title
   *   DocumentFactory.buildInput({ title: 'a'.repeat(256) }) // BVA: too long
   */
  buildInput(overrides: Partial<CreateDocumentInput> = {}): CreateDocumentInput {
    return {
      title:   `Factory Document #${next()}`,
      message: 'Please review and sign this document.',
      ...overrides,
    };
  },

  /**
   * Build a valid recipient input object.
   *
   * @example
   *   DocumentFactory.buildRecipient()
   *   DocumentFactory.buildRecipient({ role: 'CC', email: 'cc@test.com' })
   */
  buildRecipient(overrides: Partial<CreateRecipientInput> = {}): CreateRecipientInput {
    const n = next();
    return {
      name:  `Signer ${n}`,
      email: `signer${n}@test.com`,
      role:  'SIGNER',
      ...overrides,
    };
  },

  /**
   * Build a valid set of list query parameters.
   *
   * @example
   *   DocumentFactory.buildListParams()                     // page=1, perPage=10
   *   DocumentFactory.buildListParams({ perPage: 1 })       // BVA: minimum page size
   *   DocumentFactory.buildListParams({ page: 0 })          // BVA: invalid page
   */
  buildListParams(overrides: Partial<ListParams> = {}): ListParams {
    return {
      page:    1,
      perPage: 10,
      ...overrides,
    };
  },

  // ── Response shape builders (for unit-testing schemas) ───────────────────

  /**
   * Build a valid document response shape — what the API returns.
   * Useful for testing Zod schema validation without a real HTTP call.
   *
   * @example
   *   const parsed = DocumentSchema.safeParse(DocumentFactory.buildResponse());
   *   expect(parsed.success).toBe(true);
   */
  buildResponse(overrides: Partial<{
    id:        number;
    title:     string;
    status:    DocumentStatus;
    createdAt: string;
    updatedAt: string;
  }> = {}) {
    const now = new Date().toISOString();
    return {
      id:        next(),
      title:     `Factory Document #${_seq}`,
      status:    'DRAFT' as DocumentStatus,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  },

  /**
   * Build a valid document list response shape.
   *
   * @example
   *   const list = DocumentFactory.buildListResponse(3);
   *   // → { documents: [{...}, {...}, {...}], totalPages: 1 }
   */
  buildListResponse(count = 1, totalPages = 1) {
    return {
      documents:  Array.from({ length: count }, () => this.buildResponse()),
      totalPages,
    };
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// RecipientFactory
// ═════════════════════════════════════════════════════════════════════════════

export const RecipientFactory = {

  reset(): void { _seq = 0; },

  buildResponse(overrides: Partial<{
    id:         number;
    documentId: number;
    email:      string;
    name:       string;
    role:       RecipientRole;
  }> = {}) {
    const n = next();
    return {
      id:         n,
      documentId: 1,
      email:      `recipient${n}@test.com`,
      name:       `Recipient ${n}`,
      role:       'SIGNER' as RecipientRole,
      ...overrides,
    };
  },
};
