import { request } from '@playwright/test';
import { env } from '../config/env';

/**
 * Global teardown — runs once after the entire suite.
 * Deletes all documents created by the data factory (prefixed with 'test-').
 * Keeps the account clean between runs.
 */
async function globalTeardown() {
  if (!env.apiKey) {
    console.log('⚠ No API key — skipping teardown');
    return;
  }

  const context = await request.newContext({ baseURL: env.baseUrl });

  try {
    let res: Awaited<ReturnType<typeof context.get>>;
    try {
      res = await context.get('/api/v1/documents?page=1&perPage=100', {
        headers: { Authorization: `Bearer ${env.apiKey}` },
      });
    } catch (e: any) {
      console.log(`⚠ App not reachable for teardown (${e.code ?? e.message}) — skipping`);
      return;
    }

    if (!res.ok()) {
      console.log('⚠ Could not fetch documents for teardown');
      return;
    }

    const { documents } = await res.json();
    const testDocs = documents.filter((d: { title: string }) =>
      d.title.startsWith('test-')
    );

    console.log(`🧹 Teardown: deleting ${testDocs.length} test document(s)`);

    for (const doc of testDocs) {
      await context.delete(`/api/v1/documents/${doc.id}`, {
        headers: { Authorization: `Bearer ${env.apiKey}` },
      });
    }
  } finally {
    await context.dispose();
  }
}

export default globalTeardown;