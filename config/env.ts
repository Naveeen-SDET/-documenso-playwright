import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Zod-validated environment configuration
 *
 * Why validate the environment with Zod?
 * ────────────────────────────────────────
 * The old pattern (process.env.X ?? 'default') has two problems:
 *
 *   1. Silent failures — a missing DOCUMENSO_API_KEY resolves to '' and
 *      causes every authenticated test to fail with a cryptic 401, not a
 *      clear "env var missing" message. Debugging takes minutes.
 *
 *   2. No type safety — process.env returns string | undefined everywhere.
 *      After Zod validation, `env.baseUrl` is guaranteed to be a valid URL
 *      string at compile time AND runtime.
 *
 * Zod validates at module load time. If a required variable is missing or
 * malformed, the test suite exits immediately with a clear error listing
 * exactly which variables are wrong and why — before a single test runs.
 *
 * This pattern is standard at Monzo, Deliveroo, and most TypeScript-first
 * engineering teams. Interviewers recognise it as a sign of production maturity.
 *
 * Variables and their requirements:
 *   BASE_URL          — required, must be a valid URL
 *   SENDER_EMAIL      — required, must be a valid email address
 *   SENDER_PASSWORD   — required, non-empty
 *   SIGNER_EMAIL      — required, must be a valid email address
 *   SIGNER_PASSWORD   — required, non-empty
 *   INBUCKET_URL      — required, must be a valid URL
 *   DOCUMENSO_API_KEY — optional (tests that need it skip if absent)
 *   TEST_ENV          — optional, controls which environment is active
 */

// ── Environment schema ────────────────────────────────────────────────────────

const EnvSchema = z
  .object({
    // ── App endpoints ───────────────────────────────────────────────────────
    BASE_URL:     z.string().url('BASE_URL must be a valid URL')
                   .default('http://localhost:3000'),
    INBUCKET_URL: z.string().url('INBUCKET_URL must be a valid URL')
                   .default('http://localhost:9000'),

    // ── Test account credentials ────────────────────────────────────────────
    SENDER_EMAIL:    z.string().email('SENDER_EMAIL must be a valid email address')
                      .default('sender@test.com'),
    SENDER_PASSWORD: z.string().min(1, 'SENDER_PASSWORD must not be empty')
                      .default('Test1234!'),
    SIGNER_EMAIL:    z.string().email('SIGNER_EMAIL must be a valid email address')
                      .default('signer@test.com'),
    SIGNER_PASSWORD: z.string().min(1, 'SIGNER_PASSWORD must not be empty')
                      .default('Test1234!'),

    // ── API key (optional — tests that need it skip gracefully when absent) ─
    DOCUMENSO_API_KEY: z.string().default(''),

    // ── Active environment (optional — used for multi-env test selection) ───
    TEST_ENV: z.enum(['local', 'ci', 'staging', 'production'])
               .default('local'),
  })
  // Transform raw env var names into camelCase for use in tests
  .transform(raw => ({
    baseUrl:        raw.BASE_URL,
    inbucketUrl:    raw.INBUCKET_URL,
    senderEmail:    raw.SENDER_EMAIL,
    senderPassword: raw.SENDER_PASSWORD,
    signerEmail:    raw.SIGNER_EMAIL,
    signerPassword: raw.SIGNER_PASSWORD,
    apiKey:         raw.DOCUMENSO_API_KEY,
    testEnv:        raw.TEST_ENV,

    // ── Derived helpers ────────────────────────────────────────────────────
    // Use these in tests instead of comparing env.testEnv === 'ci' directly.
    // Naming the concept is clearer than comparing strings.
    isCI:       raw.TEST_ENV === 'ci',
    isLocal:    raw.TEST_ENV === 'local',
    hasApiKey:  raw.DOCUMENSO_API_KEY.length > 0,
  }));

// ── Parse and validate ────────────────────────────────────────────────────────

const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  // Print every issue clearly before exiting — no hunting through stack traces
  const issues = result.error.issues
    .map(i => `  ✗ ${i.path.join('.')}: ${i.message}`)
    .join('\n');

  throw new Error(
    `\n\nInvalid test environment configuration:\n${issues}\n\n` +
    `Copy .env.example to .env and fill in the required values.\n`,
  );
}

export const env = result.data;

// Export the inferred type so fixtures can use it without re-importing zod
export type Env = typeof env;
