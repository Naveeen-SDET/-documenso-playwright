import fs   from 'fs';
import path from 'path';
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

  /**
   * Upload a PDF and create a new document.
   * Uses multipart/form-data — the Documenso v1 API expects a `file` field.
   *
   * @param pdfPath  Absolute path to the PDF file
   * @param title    Document title (defaults to the filename)
   */
  async create(pdfPath: string, title?: string): Promise<Document> {
    const filename = path.basename(pdfPath);

    const res = await this.request.post(
      this.url('/api/v1/documents'),
      {
        headers: this.authHeaders(),
        multipart: {
          file: {
            name:     filename,
            mimeType: 'application/pdf',
            buffer:   fs.readFileSync(pdfPath),
          },
          ...(title ? { title } : {}),
        },
      }
    );

    if (!res.ok()) {
      throw new Error(`POST /documents failed: ${res.status()} ${await res.text()}`);
    }

    return res.json();
  }

  async delete(id: number): Promise<void> {
    const res = await this.request.delete(
      this.url(`/api/v1/documents/${id}`),
      { headers: this.authHeaders() }
    );

    if (!res.ok()) {
      throw new Error(`DELETE /documents/${id} failed: ${res.status()}`);
    }
  }

}