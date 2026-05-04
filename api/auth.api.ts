import { type APIRequestContext } from '@playwright/test';
import { env } from '../config/env';

export interface LoginResponse {
  token: string;
}

/**
 * Auth API — login and token generation.
 * Used by CI setup to get a fresh API token against the live DB.
 */
export class AuthApi {
  private readonly request: APIRequestContext;

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  /**
   * Log in via the Documenso web session endpoint.
   * Returns the session cookie context — used to call authenticated endpoints.
   */
  async login(email: string, password: string): Promise<boolean> {
    const res = await this.request.post(`${env.baseUrl}/api/auth/callback/credentials`, {
      form: {
        email,
        password,
        redirect: 'false',
        callbackUrl: env.baseUrl,
        json: 'true',
      },
    });
    return res.ok();
  }

  /**
   * Create an API token for the currently authenticated session.
   * Returns the raw token string.
   */
  async createToken(name: string): Promise<string> {
    const res = await this.request.post(`${env.baseUrl}/api/v1/token`, {
      data: { name, expiresIn: null },
    });

    if (!res.ok()) {
      throw new Error(`Failed to create API token: ${res.status()} ${await res.text()}`);
    }

    const body = await res.json();
    return body.token ?? body.apiToken ?? body.key;
  }
}