import { describe, it, expect, vi, type MockInstance } from 'vitest';
import type { APIRequestContext } from '@playwright/test';
import { ApiClient } from '../../api/apiClient';
import { DocumentsApi } from '../../api/documents.api';

/**
 * Unit tests — api/apiClient.ts + api/documents.api.ts
 *
 * What we test and what we don't:
 * ────────────────────────────────
 * We test the client logic that doesn't require a live HTTP server:
 *   - URL construction (joining base URL + path, handling slashes)
 *   - Auth header format (Bearer scheme, token injection)
 *   - Error throw on non-ok response (status handling)
 *   - Query string building (pagination params)
 *
 * We do NOT test whether the Documenso API returns the right data —
 * that's what tests/api/ (contract tests + integration tests) are for.
 * Mocking the HTTP response here would be circular: we'd only prove the
 * client returns what we told it to return.
 *
 * Pattern: expose protected methods via a thin test subclass.
 * ApiClient.url() and ApiClient.authHeaders() are protected — we access
 * them through a TestableApiClient subclass rather than casting to `any`.
 * This is cleaner than (client as any).url() and is a standard pattern
 * for unit-testing protected methods without breaking encapsulation.
 */

// ── Test subclass — exposes protected methods ─────────────────────────────────

class TestableApiClient extends ApiClient {
  // Expose protected methods as public for testing
  public buildUrl(path: string): string {
    return this.url(path);
  }

  public getAuthHeaders(): Record<string, string> {
    return this.authHeaders();
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getToken(): string {
    return this.token;
  }
}

// ── Mock APIRequestContext ────────────────────────────────────────────────────

/**
 * Minimal mock of Playwright's APIRequestContext.
 * We only need the methods DocumentsApi actually calls.
 */
function makeMockRequest(overrides: Partial<APIRequestContext> = {}): APIRequestContext {
  return {
    get:    vi.fn(),
    post:   vi.fn(),
    put:    vi.fn(),
    delete: vi.fn(),
    patch:  vi.fn(),
    dispose: vi.fn(),
    fetch:  vi.fn(),
    head:   vi.fn(),
    ...overrides,
  } as unknown as APIRequestContext;
}

// ── ApiClient — URL construction ──────────────────────────────────────────────

describe('ApiClient.url()', () => {

  const client = new TestableApiClient(
    makeMockRequest(),
    'http://localhost:3000',
    'test-token',
  );

  it('joins base URL and path correctly', () => {
    expect(client.buildUrl('/api/v1/documents')).toBe('http://localhost:3000/api/v1/documents');
  });

  it('works with nested paths', () => {
    expect(client.buildUrl('/api/v1/documents/42')).toBe('http://localhost:3000/api/v1/documents/42');
  });

  it('works with query strings in the path', () => {
    expect(client.buildUrl('/api/v1/documents?page=1&perPage=10'))
      .toBe('http://localhost:3000/api/v1/documents?page=1&perPage=10');
  });

  it('preserves a trailing slash on the base URL when path has one', () => {
    const c = new TestableApiClient(makeMockRequest(), 'http://localhost:3000', 't');
    expect(c.buildUrl('/api/')).toBe('http://localhost:3000/api/');
  });

  it('stores the base URL on the instance', () => {
    expect(client.getBaseUrl()).toBe('http://localhost:3000');
  });

  it('stores the token on the instance', () => {
    expect(client.getToken()).toBe('test-token');
  });

});

// ── ApiClient — auth headers ──────────────────────────────────────────────────

describe('ApiClient.authHeaders()', () => {

  it('returns an Authorization header', () => {
    const client = new TestableApiClient(makeMockRequest(), 'http://localhost:3000', 'abc123');
    const headers = client.getAuthHeaders();
    expect(headers).toHaveProperty('Authorization');
  });

  it('uses Bearer scheme', () => {
    const client = new TestableApiClient(makeMockRequest(), 'http://localhost:3000', 'abc123');
    expect(client.getAuthHeaders()['Authorization']).toMatch(/^Bearer /);
  });

  it('includes the token value after Bearer', () => {
    const token = 'my-secret-token-xyz';
    const client = new TestableApiClient(makeMockRequest(), 'http://localhost:3000', token);
    expect(client.getAuthHeaders()['Authorization']).toBe(`Bearer ${token}`);
  });

  it('a different token produces a different header', () => {
    const a = new TestableApiClient(makeMockRequest(), 'http://localhost:3000', 'token-a');
    const b = new TestableApiClient(makeMockRequest(), 'http://localhost:3000', 'token-b');
    expect(a.getAuthHeaders()['Authorization']).not.toBe(b.getAuthHeaders()['Authorization']);
  });

});

// ── DocumentsApi — query string building ─────────────────────────────────────

describe('DocumentsApi.list() — query string construction', () => {

  /**
   * DocumentsApi.list() builds a query string from the params object.
   * We verify the URL it constructs by intercepting the mock request.get() call.
   * This tests the client logic (URL building) without a real HTTP response.
   */
  it('calls GET with page and perPage as query params', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      ok:   () => true,
      json: async () => ({ documents: [], totalPages: 0 }),
    });

    const mockRequest = makeMockRequest({ get: mockGet });
    const api = new DocumentsApi(mockRequest, 'http://localhost:3000', 'tok');

    await api.list({ page: 2, perPage: 25 });

    expect(mockGet).toHaveBeenCalledOnce();
    const calledUrl: string = mockGet.mock.calls[0][0];
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('perPage=25');
  });

  it('calls GET without query params when none are provided', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      ok:   () => true,
      json: async () => ({ documents: [], totalPages: 0 }),
    });

    const mockRequest = makeMockRequest({ get: mockGet });
    const api = new DocumentsApi(mockRequest, 'http://localhost:3000', 'tok');

    await api.list();

    const calledUrl: string = mockGet.mock.calls[0][0];
    // URL ends with ? or has no query string at all
    expect(calledUrl).toMatch(/\/api\/v1\/documents\??$/);
  });

  it('throws an error when the response is not ok', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      ok:   () => false,
      status: () => 401,
      text: async () => 'Unauthorized',
    });

    const api = new DocumentsApi(makeMockRequest({ get: mockGet }), 'http://localhost:3000', 'bad-tok');

    await expect(api.list()).rejects.toThrow('GET /documents failed');
  });

});

// ── DocumentsApi — getById() ──────────────────────────────────────────────────

describe('DocumentsApi.getById()', () => {

  it('includes the document ID in the URL', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      ok:   () => true,
      json: async () => ({ id: 42, title: 'Test', status: 'DRAFT', createdAt: '', updatedAt: '' }),
    });

    const api = new DocumentsApi(makeMockRequest({ get: mockGet }), 'http://localhost:3000', 'tok');
    await api.getById(42);

    const calledUrl: string = mockGet.mock.calls[0][0];
    expect(calledUrl).toContain('/api/v1/documents/42');
  });

  it('throws when response is not ok', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      ok:     () => false,
      status: () => 404,
      text:   async () => 'Not found',
    });

    const api = new DocumentsApi(makeMockRequest({ get: mockGet }), 'http://localhost:3000', 'tok');
    await expect(api.getById(999)).rejects.toThrow('GET /documents/999 failed');
  });

});
