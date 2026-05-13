import { type APIRequestContext } from '@playwright/test';

/**
 * Base API client — wraps Playwright's request fixture with auth + base URL.
 * All API modules extend from this.
 */
export class ApiClient {
  protected readonly request: APIRequestContext;
  protected readonly baseUrl: string;
  protected readonly token: string;

  constructor(request: APIRequestContext, baseUrl: string, token: string) {
    this.request = request;
    this.baseUrl  = baseUrl;
    this.token    = token;
  }

  protected authHeaders() {
    return { 'Authorization': `Bearer ${this.token}` };
  }

  protected url(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}