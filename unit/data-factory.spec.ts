import { describe, it, expect } from 'vitest';
import {
  generateDocument,
  generateUser,
  generateEmail,
  type DocumentData,
  type UserData,
} from '../utils/data-factory';

/**
 * Unit tests — utils/data-factory.ts
 *
 * Why unit-test a data factory?
 * ──────────────────────────────
 * The data factory is used by every test in the suite. If it silently produces
 * duplicate IDs, the wrong email format, or drops overrides, tests fail
 * mysteriously and appear flaky — the worst category of CI failure.
 *
 * These tests verify the contract the rest of the suite depends on:
 *   1. Values are correctly prefixed (test-) for teardown identification
 *   2. Every call produces unique values (collision-free across parallel workers)
 *   3. Override spreading works (callers can pin specific fields)
 *   4. Generated values match the format expected by the Documenso API
 *
 * These are pure function tests — no network, no filesystem, no mocks needed.
 * They run in milliseconds and are the cheapest tests in the pyramid.
 */

// ── generateDocument() ────────────────────────────────────────────────────────

describe('generateDocument()', () => {

  it('returns an object with title and fileName fields', () => {
    const doc = generateDocument();
    expect(doc).toHaveProperty('title');
    expect(doc).toHaveProperty('fileName');
  });

  it('title has the test- prefix', () => {
    const { title } = generateDocument();
    expect(title).toMatch(/^test-/);
  });

  it('fileName has the test- prefix', () => {
    const { fileName } = generateDocument();
    expect(fileName).toMatch(/^test-/);
  });

  it('fileName ends with .pdf', () => {
    const { fileName } = generateDocument();
    expect(fileName).toMatch(/\.pdf$/);
  });

  it('title contains a unique hex segment', () => {
    const { title } = generateDocument();
    // Format: test-doc-<8 hex chars>
    expect(title).toMatch(/^test-doc-[0-9a-f]{8}$/);
  });

  it('two calls produce different titles (collision-free)', () => {
    const a = generateDocument();
    const b = generateDocument();
    expect(a.title).not.toBe(b.title);
  });

  it('two calls produce different fileNames (collision-free)', () => {
    const a = generateDocument();
    const b = generateDocument();
    expect(a.fileName).not.toBe(b.fileName);
  });

  it('override.title replaces the generated title', () => {
    const doc = generateDocument({ title: 'Custom Title' });
    expect(doc.title).toBe('Custom Title');
  });

  it('override.fileName replaces the generated fileName', () => {
    const doc = generateDocument({ fileName: 'my-file.pdf' });
    expect(doc.fileName).toBe('my-file.pdf');
  });

  it('partial override preserves the unoverridden field', () => {
    const doc = generateDocument({ title: 'Fixed Title' });
    // fileName was not overridden — should still be generated
    expect(doc.fileName).toMatch(/^test-/);
    expect(doc.fileName).toMatch(/\.pdf$/);
  });

  it('satisfies the DocumentData interface shape', () => {
    // TypeScript enforces this at compile time, but runtime check adds defence
    const doc: DocumentData = generateDocument();
    expect(typeof doc.title).toBe('string');
    expect(typeof doc.fileName).toBe('string');
  });

});

// ── generateUser() ────────────────────────────────────────────────────────────

describe('generateUser()', () => {

  it('returns an object with name, email, and password fields', () => {
    const user = generateUser();
    expect(user).toHaveProperty('name');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('password');
  });

  it('name has the test- prefix', () => {
    expect(generateUser().name).toMatch(/^test-/);
  });

  it('email has the test- prefix', () => {
    expect(generateUser().email).toMatch(/^test-/);
  });

  it('email ends with @test.com', () => {
    expect(generateUser().email).toMatch(/@test\.com$/);
  });

  it('email is a valid email address format', () => {
    const { email } = generateUser();
    // RFC 5322 simplified: local@domain.tld
    expect(email).toMatch(/^[^@]+@[^@]+\.[^@]+$/);
  });

  it('password is always Test1234!', () => {
    // Fixed password allows auth tests to be deterministic
    expect(generateUser().password).toBe('Test1234!');
  });

  it('two calls produce different emails (collision-free)', () => {
    const a = generateUser();
    const b = generateUser();
    expect(a.email).not.toBe(b.email);
  });

  it('two calls produce different names (collision-free)', () => {
    const a = generateUser();
    const b = generateUser();
    expect(a.name).not.toBe(b.name);
  });

  it('override.email replaces the generated email', () => {
    const user = generateUser({ email: 'custom@example.com' });
    expect(user.email).toBe('custom@example.com');
  });

  it('override.password replaces the default password', () => {
    const user = generateUser({ password: 'NewPass99!' });
    expect(user.password).toBe('NewPass99!');
  });

  it('partial override preserves unoverridden fields', () => {
    const user = generateUser({ email: 'fixed@test.com' });
    expect(user.name).toMatch(/^test-/);
    expect(user.password).toBe('Test1234!');
  });

  it('satisfies the UserData interface shape', () => {
    const user: UserData = generateUser();
    expect(typeof user.name).toBe('string');
    expect(typeof user.email).toBe('string');
    expect(typeof user.password).toBe('string');
  });

});

// ── generateEmail() ───────────────────────────────────────────────────────────

describe('generateEmail()', () => {

  it('returns a string', () => {
    expect(typeof generateEmail()).toBe('string');
  });

  it('has the test- prefix', () => {
    expect(generateEmail()).toMatch(/^test-/);
  });

  it('ends with @test.com', () => {
    expect(generateEmail()).toMatch(/@test\.com$/);
  });

  it('is a valid email format', () => {
    expect(generateEmail()).toMatch(/^[^@]+@[^@]+\.[^@]+$/);
  });

  it('two calls produce different values (collision-free)', () => {
    const a = generateEmail();
    const b = generateEmail();
    expect(a).not.toBe(b);
  });

  it('100 calls produce 100 unique values (statistical uniqueness check)', () => {
    const emails = new Set(Array.from({ length: 100 }, () => generateEmail()));
    expect(emails.size).toBe(100);
  });

});
