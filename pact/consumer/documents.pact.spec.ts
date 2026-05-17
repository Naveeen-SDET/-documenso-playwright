import path from 'path';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import axios from 'axios';

/**
 * Pact Consumer Tests — Documents API
 *
 * What is consumer-driven contract testing?
 * ──────────────────────────────────────────
 * In Zod contract testing (tests/api/contracts.spec.ts) we validate that
 * the REAL API matches our schema. That proves today's API is correct.
 *
 * Pact goes further:
 *   1. The CONSUMER (us) defines exactly what it needs from the provider.
 *   2. Pact spins up a MOCK SERVER that replays those interactions.
 *   3. The consumer tests run against the mock — zero real network needed.
 *   4. Pact generates a pact.json file describing the agreed contract.
 *   5. The PROVIDER runs its own verification against that file (Day 28).
 *
 * Why this matters in regulated industries:
 *   When a backend team changes an API, the pact file catches the break
 *   before it reaches production — even if the teams work independently.
 *   Used at companies like Atlassian, REA Group, and ITV at scale.
 *
 * Consumer = our test client (simulates a frontend or integration)
 * Provider = Documenso's REST API (/api/v1)
 */

const { like, eachLike, integer, string, datetime } = MatchersV3;

// ── Pact instance ─────────────────────────────────────────────────────────────
const provider = new PactV3({
  consumer: 'documenso-consumer',
  provider: 'documenso-api',
  dir: path.resolve(__dirname, '../../pacts'),
  logLevel: 'warn',
});

// ── Helper: typed API calls against the Pact mock server ─────────────────────
function makeClient(baseUrl: string) {
  return {
    async listDocuments(page = 1, perPage = 10) {
      const res = await axios.get(`${baseUrl}/api/v1/documents`, {
        params: { page, perPage },
        headers: { Authorization: 'Bearer test-api-key' },
      });
      return res.data;
    },

    async getDocumentById(id: number) {
      const res = await axios.get(`${baseUrl}/api/v1/documents/${id}`, {
        headers: { Authorization: 'Bearer test-api-key' },
      });
      return res.data;
    },

    async listDocumentsNoAuth() {
      try {
        await axios.get(`${baseUrl}/api/v1/documents`);
      } catch (e: any) {
        return { status: e.response?.status, body: e.response?.data };
      }
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERACTION 1 — GET /api/v1/documents (list)
// ══════════════════════════════════════════════════════════════════════════════

describe('Pact — GET /api/v1/documents', () => {

  test('returns a valid document list with pagination metadata', async () => {
    await provider
      .addInteraction({
        states: [{ description: 'documents exist for the authenticated user' }],
        uponReceiving: 'a request to list documents',
        withRequest: {
          method: 'GET',
          path: '/api/v1/documents',
          query: { page: '1', perPage: '10' },
          headers: { Authorization: like('Bearer test-api-key') },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            documents: eachLike({
              id:        integer(1),
              title:     string('Test Document'),
              status:    string('DRAFT'),
              createdAt: datetime("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", '2025-01-01T00:00:00.000Z'),
              updatedAt: datetime("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", '2025-01-01T00:00:00.000Z'),
            }),
            totalPages: integer(1),
          },
        },
      })
      .executeTest(async (mockServer) => {
        const client = makeClient(mockServer.url);
        const data = await client.listDocuments(1, 10);

        // Consumer assertions — what we actually use from the response
        expect(Array.isArray(data.documents)).toBe(true);
        expect(typeof data.totalPages).toBe('number');
        expect(data.totalPages).toBeGreaterThanOrEqual(0);

        const doc = data.documents[0];
        expect(typeof doc.id).toBe('number');
        expect(typeof doc.title).toBe('string');
        expect(typeof doc.status).toBe('string');
        expect(typeof doc.createdAt).toBe('string');
        expect(typeof doc.updatedAt).toBe('string');
      });
  });

  test('returns empty list when no documents exist', async () => {
    await provider
      .addInteraction({
        states: [{ description: 'no documents exist for the authenticated user' }],
        uponReceiving: 'a request to list documents when account is empty',
        withRequest: {
          method: 'GET',
          path: '/api/v1/documents',
          query: { page: '1', perPage: '10' },
          headers: { Authorization: like('Bearer test-api-key') },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            documents: [],
            totalPages: integer(0),
          },
        },
      })
      .executeTest(async (mockServer) => {
        const client = makeClient(mockServer.url);
        const data = await client.listDocuments(1, 10);

        expect(data.documents).toHaveLength(0);
        expect(data.totalPages).toBe(0);
      });
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// INTERACTION 2 — GET /api/v1/documents/:id
// ══════════════════════════════════════════════════════════════════════════════

describe('Pact — GET /api/v1/documents/:id', () => {

  test('returns a single document by ID', async () => {
    await provider
      .addInteraction({
        states: [{ description: 'document with id 1 exists' }],
        uponReceiving: 'a request to fetch document by ID',
        withRequest: {
          method: 'GET',
          path: '/api/v1/documents/1',
          headers: { Authorization: like('Bearer test-api-key') },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            id:        integer(1),
            title:     string('Test Document'),
            status:    string('DRAFT'),
            createdAt: datetime("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", '2025-01-01T00:00:00.000Z'),
            updatedAt: datetime("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", '2025-01-01T00:00:00.000Z'),
          },
        },
      })
      .executeTest(async (mockServer) => {
        const client = makeClient(mockServer.url);
        const doc = await client.getDocumentById(1);

        expect(doc.id).toBe(1);
        expect(typeof doc.title).toBe('string');
        expect(typeof doc.status).toBe('string');
        expect(typeof doc.createdAt).toBe('string');
        expect(typeof doc.updatedAt).toBe('string');
      });
  });

  test('returns 404 for non-existent document', async () => {
    await provider
      .addInteraction({
        states: [{ description: 'document with id 999999 does not exist' }],
        uponReceiving: 'a request for a document that does not exist',
        withRequest: {
          method: 'GET',
          path: '/api/v1/documents/999999',
          headers: { Authorization: like('Bearer test-api-key') },
        },
        willRespondWith: {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          body: {
            message: string('Document not found'),
          },
        },
      })
      .executeTest(async (mockServer) => {
        const client = makeClient(mockServer.url);
        try {
          await axios.get(`${mockServer.url}/api/v1/documents/999999`, {
            headers: { Authorization: 'Bearer test-api-key' },
          });
          throw new Error('Expected 404 error');
        } catch (e: any) {
          expect(e.response.status).toBe(404);
          expect(typeof e.response.data.message).toBe('string');
        }
      });
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// INTERACTION 3 — Unauthenticated request
// ══════════════════════════════════════════════════════════════════════════════

describe('Pact — unauthenticated requests', () => {

  test('rejects request without Authorization header with 401', async () => {
    await provider
      .addInteraction({
        states: [{ description: 'no authentication provided' }],
        uponReceiving: 'an unauthenticated request to list documents',
        withRequest: {
          method: 'GET',
          path: '/api/v1/documents',
        },
        willRespondWith: {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
          body: {
            message: string('Unauthorized'),
          },
        },
      })
      .executeTest(async (mockServer) => {
        const client = makeClient(mockServer.url);
        const result = await client.listDocumentsNoAuth();

        expect(result?.status).toBe(401);
        expect(typeof result?.body?.message).toBe('string');
      });
  });

});
