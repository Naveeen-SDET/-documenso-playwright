import { test, expect } from '../fixtures';
import { generateDocument } from '../../utils/data-factory';

test.use({ storageState: '.auth/sender.json' });

test.describe('@regression @ui data factory isolation', () => {

  test.beforeEach(async ({}, testInfo) => {
    testInfo.skip(!!process.env.CI, 'Requires local Docker stack');
  });

  test('two tests generate unique document titles', () => {
    const doc1 = generateDocument();
    const doc2 = generateDocument();

    expect(doc1.title).not.toBe(doc2.title);
    expect(doc1.title).toMatch(/^test-doc-/);
    expect(doc2.title).toMatch(/^test-doc-/);
  });

  test('generated titles are unique across 100 calls', () => {
    const titles = Array.from({ length: 100 }, () => generateDocument().title);
    const unique  = new Set(titles);
    expect(unique.size).toBe(100);
  });

});