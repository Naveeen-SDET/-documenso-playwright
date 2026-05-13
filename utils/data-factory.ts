import { randomBytes } from 'crypto';

/**
 * Data Factory v2 — parallel-safe test data generation
 *
 * Every generated value is prefixed with 'test-' + a unique ID.
 * Two parallel runs will never produce conflicting data.
 * Global teardown identifies and cleans up test data by the 'test-' prefix.
 */

const PREFIX = 'test';

function uid(length = 8): string {
  return randomBytes(length).toString('hex').slice(0, length);
}

export function generateDocument(overrides: Partial<DocumentData> = {}): DocumentData {
  const id = uid();
  return {
    title:    `${PREFIX}-doc-${id}`,
    fileName: `${PREFIX}-${id}.pdf`,
    ...overrides,
  };
}

export function generateUser(overrides: Partial<UserData> = {}): UserData {
  const id = uid();
  return {
    name:     `${PREFIX}-user-${id}`,
    email:    `${PREFIX}-${id}@test.com`,
    password: 'Test1234!',
    ...overrides,
  };
}

export function generateEmail(): string {
  return `${PREFIX}-${uid()}@test.com`;
}

export interface DocumentData {
  title:    string;
  fileName: string;
}

export interface UserData {
  name:     string;
  email:    string;
  password: string;
}