/**
 * prompts.ts
 *
 * Prompt templates for AI test generation.
 * Kept separate so they can be reviewed, version-controlled, and improved
 * independently of the CLI logic. A prompt is code — treat it that way.
 */

// ── Zod schema generation prompt ─────────────────────────────────────────────

export function buildSchemaPrompt(endpointSpec: string): string {
  return `You are a senior TypeScript engineer writing Zod v4 validation schemas for a Playwright API test suite.

The application under test is Documenso — an open-source eIDAS-compliant e-signature platform.
Base URL: http://localhost:3000
Auth: Bearer token via Authorization header.

Given the following API endpoint specification, generate a Zod v4 schema for the response body.

ENDPOINT SPEC:
${endpointSpec}

REQUIREMENTS:
1. Use Zod v4 syntax: z.object(), z.string(), z.number(), z.boolean(), z.array(), z.enum(), z.union(), z.optional(), z.nullable()
2. In Zod v4, use z.record(z.string(), z.unknown()) — NOT z.record(z.unknown())
3. Use .describe() on fields that have non-obvious meaning
4. Mark fields as .optional() only if the spec says they may be absent
5. Mark fields as .nullable() only if the spec says they can be null
6. Export the schema as a named const and export an inferred TypeScript type
7. Add a brief JSDoc comment explaining what each schema validates
8. Do NOT import from zod — assume it is already imported as: import { z } from 'zod'

OUTPUT FORMAT:
Return ONLY valid TypeScript code. No markdown fences. No explanation text outside comments.
Start with the JSDoc comment, then the schema, then the type export.

EXAMPLE OUTPUT SHAPE:
/** Validates a single document returned by GET /api/v1/documents/:id */
export const DocumentSchema = z.object({
  id: z.number().describe('Unique document identifier'),
  title: z.string(),
  status: z.enum(['DRAFT', 'PENDING', 'COMPLETED', 'DECLINED']),
  createdAt: z.string().datetime(),
});
export type Document = z.infer<typeof DocumentSchema>;`;
}

// ── Test skeleton generation prompt ──────────────────────────────────────────

export function buildTestPrompt(endpointSpec: string, schemaCode: string): string {
  return `You are a senior SDET writing Playwright API tests in TypeScript.

The application under test is Documenso — an open-source eIDAS-compliant e-signature platform.
Base URL: http://localhost:3000
Auth: Bearer token via Authorization header (env variable: DOCUMENSO_API_KEY).

Given the following API endpoint specification and its Zod schema, generate a Playwright test file.

ENDPOINT SPEC:
${endpointSpec}

ZOD SCHEMA (already defined — import it in the test):
${schemaCode}

REQUIREMENTS:
1. Use @playwright/test (test, expect) — NOT jest or vitest
2. Import env from '../../config/env' for BASE_URL and API key
3. Each test must have a descriptive name starting with the HTTP method: "GET /api/v1/... returns ..."
4. Include these test categories:
   a. Happy path — valid request returns 200 with correct schema
   b. Auth guard — missing token returns 401
   c. Auth guard — invalid token returns 401
   d. Schema validation — response matches Zod schema (use schema.parse())
   e. At least 2 boundary/edge cases appropriate to this endpoint
5. Add a skip guard for ECONNREFUSED (Docker not running) using try/catch
6. Add a test.describe block with @api tag in the name
7. Add a JSDoc comment at the top explaining what the suite tests and why
8. Tests must be independent — no shared state between tests

OUTPUT FORMAT:
Return ONLY valid TypeScript code. No markdown fences. No explanation outside comments.
The file must be runnable with: pnpm exec playwright test <filename> --project=ci`;
}

// ── Edge case suggestion prompt ───────────────────────────────────────────────

export function buildEdgeCasePrompt(existingTestCode: string): string {
  return `You are a senior SDET reviewing a Playwright API test file for an e-signature platform.

Your job is to suggest additional edge cases that are NOT already covered by the existing tests.
Focus on edge cases that are realistic in a production environment and relevant to:
- Legal/regulated-industry concerns (eIDAS, audit trails, document integrity)
- Security (auth bypass, token reuse, IDOR)
- Data boundary conditions (empty arrays, max-length strings, special characters)
- Concurrency (what happens if the same document is acted on twice simultaneously)

EXISTING TEST CODE:
${existingTestCode}

OUTPUT FORMAT:
Return a numbered list of edge case suggestions. For each one:
1. One-line description of the test
2. Why it matters in a regulated/production context
3. The key assertion (what would you check)

Return maximum 8 suggestions. Be specific — no generic "test error handling" suggestions.`;
}
