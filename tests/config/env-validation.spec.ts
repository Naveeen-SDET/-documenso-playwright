import { test, expect } from '@playwright/test';
import { z } from 'zod';

/**
 * Environment Configuration Validation Tests
 *
 * We test the validation LOGIC here, not the live `env` object.
 * Reason: the exported `env` already has valid defaults, so
 * testing it directly would never catch a broken validator.
 *
 * Pattern: inline a copy of the schema, feed it deliberate broken
 * inputs, assert it rejects them with the right error messages.
 *
 * This is meta-testing — proving your config guard has teeth,
 * the same way contracts-negative.spec.ts proves Zod schemas have teeth.
 *
 * Run: pnpm exec playwright test tests/config/env-validation.spec.ts --project=ci --reporter=list
 */

// ── Inline schema (mirrors config/env.ts — kept in sync manually) ─────────────
// We duplicate the schema here rather than importing it to keep these tests
// independent: if config/env.ts crashes at load time the tests still run.

const EnvSchema = z
  .object({
    BASE_URL:          z.string().url('BASE_URL must be a valid URL').default('http://localhost:3000'),
    INBUCKET_URL:      z.string().url('INBUCKET_URL must be a valid URL').default('http://localhost:9000'),
    SENDER_EMAIL:      z.string().email('SENDER_EMAIL must be a valid email address').default('sender@test.com'),
    SENDER_PASSWORD:   z.string().min(1, 'SENDER_PASSWORD must not be empty').default('Test1234!'),
    SIGNER_EMAIL:      z.string().email('SIGNER_EMAIL must be a valid email address').default('signer@test.com'),
    SIGNER_PASSWORD:   z.string().min(1, 'SIGNER_PASSWORD must not be empty').default('Test1234!'),
    DOCUMENSO_API_KEY: z.string().default(''),
    TEST_ENV:          z.enum(['local', 'ci', 'staging', 'production']).default('local'),
  })
  .transform(raw => ({
    baseUrl:        raw.BASE_URL,
    inbucketUrl:    raw.INBUCKET_URL,
    senderEmail:    raw.SENDER_EMAIL,
    senderPassword: raw.SENDER_PASSWORD,
    signerEmail:    raw.SIGNER_EMAIL,
    signerPassword: raw.SIGNER_PASSWORD,
    apiKey:         raw.DOCUMENSO_API_KEY,
    testEnv:        raw.TEST_ENV,
    isCI:           raw.TEST_ENV === 'ci',
    isLocal:        raw.TEST_ENV === 'local',
    hasApiKey:      raw.DOCUMENSO_API_KEY.length > 0,
  }));

// ── Helper ─────────────────────────────────────────────────────────────────────

function parse(overrides: Record<string, string>) {
  return EnvSchema.safeParse(overrides);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Valid configurations (schema must accept)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@config Env — valid configurations', () => {

  test('accepts empty object — all fields have defaults', () => {
    const result = parse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseUrl).toBe('http://localhost:3000');
      expect(result.data.testEnv).toBe('local');
      expect(result.data.isLocal).toBe(true);
      expect(result.data.isCI).toBe(false);
      expect(result.data.hasApiKey).toBe(false);
    }
  });

  test('accepts full valid configuration', () => {
    const result = parse({
      BASE_URL:          'http://localhost:3000',
      INBUCKET_URL:      'http://localhost:9000',
      SENDER_EMAIL:      'sender@test.com',
      SENDER_PASSWORD:   'Secret1234!',
      SIGNER_EMAIL:      'signer@test.com',
      SIGNER_PASSWORD:   'Secret1234!',
      DOCUMENSO_API_KEY: 'api_abc123',
      TEST_ENV:          'local',
    });
    expect(result.success).toBe(true);
  });

  test('derives hasApiKey=true when DOCUMENSO_API_KEY is set', () => {
    const result = parse({ DOCUMENSO_API_KEY: 'api_xyz' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.hasApiKey).toBe(true);
  });

  test('derives hasApiKey=false when DOCUMENSO_API_KEY is empty string', () => {
    const result = parse({ DOCUMENSO_API_KEY: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.hasApiKey).toBe(false);
  });

  test('accepts TEST_ENV=ci and derives isCI=true', () => {
    const result = parse({ TEST_ENV: 'ci' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isCI).toBe(true);
      expect(result.data.isLocal).toBe(false);
    }
  });

  test('accepts TEST_ENV=staging', () => {
    const result = parse({ TEST_ENV: 'staging' });
    expect(result.success).toBe(true);
  });

  test('accepts TEST_ENV=production', () => {
    const result = parse({ TEST_ENV: 'production' });
    expect(result.success).toBe(true);
  });

  test('accepts HTTPS base URL', () => {
    const result = parse({ BASE_URL: 'https://staging.documenso.example.com' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.baseUrl).toBe('https://staging.documenso.example.com');
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Invalid configurations (schema must reject)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@config Env — invalid configurations', () => {

  const invalidCases: Array<{
    label:       string;
    input:       Record<string, string>;
    errorField:  string;
    errorSnippet?: string;
  }> = [
    {
      label:      'BASE_URL has no host (http://)',
      input:      { BASE_URL: 'http://' },   // scheme present but empty host
      errorField: 'BASE_URL',
      errorSnippet: 'must be a valid URL',
    },
    {
      label:      'BASE_URL is a plain string with spaces',
      input:      { BASE_URL: 'not a url' },  // spaces make it unparseable
      errorField: 'BASE_URL',
    },
    {
      label:      'INBUCKET_URL has no host (http://)',
      input:      { INBUCKET_URL: 'http://' },
      errorField: 'INBUCKET_URL',
    },
    {
      label:      'SENDER_EMAIL is not an email',
      input:      { SENDER_EMAIL: 'not-an-email' },
      errorField: 'SENDER_EMAIL',
      errorSnippet: 'must be a valid email address',
    },
    {
      label:      'SENDER_EMAIL is missing the domain',
      input:      { SENDER_EMAIL: 'user@' },
      errorField: 'SENDER_EMAIL',
    },
    {
      label:      'SIGNER_EMAIL is not an email',
      input:      { SIGNER_EMAIL: 'bademail' },
      errorField: 'SIGNER_EMAIL',
    },
    {
      label:      'SENDER_PASSWORD is empty string',
      input:      { SENDER_PASSWORD: '' },
      errorField: 'SENDER_PASSWORD',
      errorSnippet: 'must not be empty',
    },
    {
      label:      'SIGNER_PASSWORD is empty string',
      input:      { SIGNER_PASSWORD: '' },
      errorField: 'SIGNER_PASSWORD',
    },
    {
      label:      'TEST_ENV is an unknown value',
      input:      { TEST_ENV: 'development' },    // not in the allowed enum
      errorField: 'TEST_ENV',
    },
    {
      label:      'TEST_ENV is uppercase',
      input:      { TEST_ENV: 'LOCAL' },           // enum is case-sensitive
      errorField: 'TEST_ENV',
    },
  ];

  for (const { label, input, errorField, errorSnippet } of invalidCases) {
    test(`rejects: ${label}`, () => {
      const result = parse(input);
      expect(result.success, `Expected schema to REJECT: ${label}`).toBe(false);

      if (!result.success) {
        const issue = result.error.issues.find(i => i.path[0] === errorField);
        expect(
          issue,
          `Expected an issue on field "${errorField}" but found:\n${JSON.stringify(result.error.issues, null, 2)}`
        ).toBeDefined();

        if (errorSnippet && issue) {
          expect(issue.message).toContain(errorSnippet);
        }
      }
    });
  }

});

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Transform output (camelCase keys + derived booleans)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('@config Env — transform output shape', () => {

  test('transforms BASE_URL → baseUrl', () => {
    const result = parse({ BASE_URL: 'http://localhost:3000' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('baseUrl'   in result.data).toBe(true);
      expect('BASE_URL'  in result.data).toBe(false);   // raw key is gone
    }
  });

  test('all expected camelCase keys are present', () => {
    const result = parse({});
    expect(result.success).toBe(true);
    if (result.success) {
      const keys = Object.keys(result.data);
      for (const expected of [
        'baseUrl', 'inbucketUrl', 'senderEmail', 'senderPassword',
        'signerEmail', 'signerPassword', 'apiKey', 'testEnv',
        'isCI', 'isLocal', 'hasApiKey',
      ]) {
        expect(keys, `Missing key: ${expected}`).toContain(expected);
      }
    }
  });

  test('no raw SCREAMING_SNAKE_CASE keys leak into output', () => {
    const result = parse({});
    expect(result.success).toBe(true);
    if (result.success) {
      const keys = Object.keys(result.data);
      const rawKeys = keys.filter(k => k === k.toUpperCase() && k.includes('_'));
      expect(rawKeys).toHaveLength(0);
    }
  });

});
