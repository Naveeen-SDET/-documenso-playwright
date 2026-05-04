import { ApiClient } from './apiClient';

export interface Document {
  id:        number;
  title:     string;
  status:    string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListResponse {
  documents:  Document[];
  totalPages: number;
}

/**
 * Documents API — typed wrapper around /api/v1/documents.
 * Tests use this instead of raw request.get() calls.
 */
export class DocumentsApi extends ApiClient {

  async list(params: { page?: number; perPage?: number } = {}): Promise<DocumentListResponse> {
    const query = new URLSearchParams();
    if (params.page)    query.set('page',    String(params.page));
    if (params.perPage) query.set('perPage', String(params.perPage));

    const res = await this.request.get(
      this.url(`/api/v1/documents?${query.toString()}`),
      { headers: this.authHeaders() }
    );

    if (!res.ok()) {
      throw new Error(`GET /documents failed: ${res.status()} ${await res.text()}`);
    }

    return res.json();
  }

  async getById(id: number): Promise<Document> {
    const res = await this.request.get(
      this.url(`/api/v1/documents/${id}`),
      { headers: this.authHeaders() }
    );

    if (!res.ok()) {
      throw new Error(`GET /documents/${id} failed: ${res.status()}`);
    }

    return res.json();
  }
}