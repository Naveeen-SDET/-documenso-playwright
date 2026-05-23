/**
 * mocks/fixtures.ts — Shared mock response bodies
 *
 * Why centralise fixture data?
 * ────────────────────────────
 * Inline mock data scattered across test files creates maintenance debt.
 * When the API schema changes, you'd need to update every test file.
 * Centralising here means one change propagates everywhere — the same
 * principle as a Page Object Model, applied to test data.
 *
 * These fixtures match the Zod schemas in schemas/document.schema.ts exactly.
 * If a schema changes, TypeScript will flag broken fixtures here first.
 *
 * Fixture categories:
 *   - List responses: empty, single, many (pagination boundary)
 *   - Edge case data: long titles, special chars, unicode, XSS strings
 *   - Status variants: all DRAFT, all COMPLETED, mixed
 *   - Error responses: 400, 401, 403, 404, 500, 503
 */

import type { Document, DocumentList } from '../schemas/document.schema';

// Re-export so handlers.ts and tests can import the type from one place
export type { DocumentList };

// ── Helpers ───────────────────────────────────────────────────────────────────

const iso = (daysAgo = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

const makeDoc = (overrides: Partial<Document> & { id: number; title: string }): Document => ({
  status:    'DRAFT',
  createdAt: iso(1),
  updatedAt: iso(0),
  userId:    1,
  teamId:    null,
  recipients: [],
  fields:    [],
  ...overrides,
});

// ── Empty state ───────────────────────────────────────────────────────────────

/** Zero documents — tests the empty state UI */
export const emptyDocumentList: DocumentList = {
  documents:  [],
  totalPages: 0,
};

// ── Single document ───────────────────────────────────────────────────────────

export const singleDocumentList: DocumentList = {
  documents: [
    makeDoc({ id: 1, title: 'Service Agreement 2026', status: 'PENDING' }),
  ],
  totalPages: 1,
};

// ── Pagination boundary ───────────────────────────────────────────────────────

/** 50 documents — triggers pagination in most list UIs */
export const manyDocumentList: DocumentList = {
  documents: Array.from({ length: 50 }, (_, i) =>
    makeDoc({
      id:        i + 1,
      title:     `Document ${String(i + 1).padStart(3, '0')} — Automated Test`,
      status:    (['DRAFT', 'PENDING', 'COMPLETED', 'DECLINED'] as const)[i % 4],
      createdAt: iso(50 - i),
      updatedAt: iso(Math.max(0, 50 - i - 5)),
    }),
  ),
  totalPages: 5,
};

// ── Status variants ───────────────────────────────────────────────────────────

export const allDraftDocumentList: DocumentList = {
  documents: Array.from({ length: 5 }, (_, i) =>
    makeDoc({ id: 100 + i, title: `Draft ${i + 1}`, status: 'DRAFT' }),
  ),
  totalPages: 1,
};

export const allCompletedDocumentList: DocumentList = {
  documents: Array.from({ length: 5 }, (_, i) =>
    makeDoc({
      id:        200 + i,
      title:     `Completed Contract ${i + 1}`,
      status:    'COMPLETED',
      createdAt: iso(30 - i),
      updatedAt: iso(20 - i),
    }),
  ),
  totalPages: 1,
};

export const mixedStatusDocumentList: DocumentList = {
  documents: [
    makeDoc({ id: 301, title: 'Draft NDA',              status: 'DRAFT'     }),
    makeDoc({ id: 302, title: 'Pending Offer Letter',   status: 'PENDING'   }),
    makeDoc({ id: 303, title: 'Completed MSA',          status: 'COMPLETED' }),
    makeDoc({ id: 304, title: 'Declined Amendment',     status: 'DECLINED'  }),
    makeDoc({ id: 305, title: 'Cancelled SOW',          status: 'CANCELLED' }),
  ],
  totalPages: 1,
};

// ── Edge case: very long title ────────────────────────────────────────────────

/** 150-character title — tests truncation / overflow handling in the list UI */
const LONG_TITLE = 'A'.repeat(75) + ' — ' + 'B'.repeat(72);   // exactly 150 chars

export const longTitleDocumentList: DocumentList = {
  documents: [
    makeDoc({ id: 401, title: LONG_TITLE, status: 'PENDING' }),
    makeDoc({ id: 402, title: 'Normal length title for comparison', status: 'DRAFT' }),
  ],
  totalPages: 1,
};

// ── Edge case: special characters & XSS strings ───────────────────────────────

/**
 * These titles contain characters that a broken template would misrender.
 * If the UI uses innerHTML instead of textContent, XSS payloads would execute.
 * The test asserts these render as visible text, not injected HTML.
 */
export const specialCharDocumentList: DocumentList = {
  documents: [
    makeDoc({ id: 501, title: '<script>alert("xss")</script>',          status: 'DRAFT' }),
    makeDoc({ id: 502, title: '"><img src=x onerror=alert(1)>',          status: 'DRAFT' }),
    makeDoc({ id: 503, title: "O'Brien & Associates — Contract 2026",    status: 'DRAFT' }),
    makeDoc({ id: 504, title: '日本語のタイトル — 契約書',               status: 'DRAFT' }),
    makeDoc({ id: 505, title: '🚀 Rocket Launch Agreement 🛸',           status: 'DRAFT' }),
    makeDoc({ id: 506, title: '   Leading and trailing spaces   ',        status: 'DRAFT' }),
    makeDoc({ id: 507, title: 'Tab\there\tand\there',                    status: 'DRAFT' }),
    makeDoc({ id: 508, title: 'Line\nBreak\nTitle',                      status: 'DRAFT' }),
  ],
  totalPages: 1,
};

// ── Edge case: boundary dates ─────────────────────────────────────────────────

export const edgeDateDocumentList: DocumentList = {
  documents: [
    makeDoc({ id: 601, title: 'Very old document', status: 'COMPLETED',
              createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z' }),
    makeDoc({ id: 602, title: 'Just now document', status: 'DRAFT',
              createdAt: new Date().toISOString(),    updatedAt: new Date().toISOString() }),
  ],
  totalPages: 1,
};

// ── Error response bodies ─────────────────────────────────────────────────────

export const errors = {
  badRequest:    { message: 'Bad Request',            code: 'BAD_REQUEST'    },
  unauthorized:  { message: 'Unauthorized',           code: 'UNAUTHORIZED'   },
  forbidden:     { message: 'Forbidden',              code: 'FORBIDDEN'      },
  notFound:      { message: 'Not found',              code: 'NOT_FOUND'      },
  internal:      { message: 'Internal Server Error',  code: 'INTERNAL_ERROR' },
  unavailable:   { message: 'Service Unavailable',    code: 'UNAVAILABLE'    },
  rateLimit:     { message: 'Too Many Requests',      code: 'RATE_LIMITED'   },
} as const;

// ── tRPC error shape ──────────────────────────────────────────────────────────

export const trpcErrors = {
  internal: {
    error: {
      message: 'Internal server error',
      code: -32603,
      data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
    },
  },
  unauthorized: {
    error: {
      message: 'Unauthorized',
      code: -32001,
      data: { code: 'UNAUTHORIZED', httpStatus: 401 },
    },
  },
  notFound: {
    error: {
      message: 'Not found',
      code: -32004,
      data: { code: 'NOT_FOUND', httpStatus: 404 },
    },
  },
} as const;
