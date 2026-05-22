# AI Test Generation — Critical Evaluation

> This document records an honest assessment of what the AI generation script
> produced correctly, what it got wrong, and the rules I derived from reviewing
> its outputs. It exists because using AI without evaluating it critically is
> not senior engineering — it is delegation without accountability.

---

## What was evaluated

The script was run against three Documenso endpoints:

| Endpoint | Command |
|----------|---------|
| `GET /api/v1/documents` | `--endpoint "GET /api/v1/documents — returns paginated list of documents for the authenticated user. Response: { data: Document[], totalPages: number, currentPage: number, perPage: number }"` |
| `GET /api/v1/documents/:id` | `--endpoint "GET /api/v1/documents/:id — returns a single document by ID. 404 if not found. 403 if document belongs to another user."` |
| `DELETE /api/v1/documents/:id` | `--endpoint "DELETE /api/v1/documents/:id — deletes a document. Returns 200 on success. 404 if not found. Only the document owner can delete."` |

---

## What the AI got right

### Schema generation (7/10)

- **Field types:** Correctly inferred `id: z.number()`, `title: z.string()`,
  `createdAt: z.string().datetime()` from field names alone.
- **Nesting:** Correctly wrapped list responses in `z.object({ data: z.array(...) })`.
- **Nullable vs optional:** Correctly made `completedAt` nullable (a document that
  hasn't been completed yet has `null`, not an absent field).
- **Zod v4 syntax:** Used `z.record(z.string(), z.unknown())` correctly — this is
  a common breaking change from v3 that the AI handled because it was in the prompt.

### Test skeleton generation (6/10)

- **Auth guard pattern:** Correctly generated both "missing token → 401" and
  "invalid token → 401" as separate tests. This is the right granularity.
- **Import paths:** Used `../../config/env` correctly without being told the exact
  path — it inferred the convention from the prompt context.
- **Test isolation:** Each test made its own request rather than sharing a response
  variable — the AI understood stateless API testing.

---

## What the AI got wrong

### 1. Enum values were incomplete

**What happened:** For `status`, the AI generated:
```typescript
status: z.enum(['DRAFT', 'PENDING', 'COMPLETED'])
```

**Actual Documenso values:** `DRAFT | PENDING | COMPLETED | DECLINED | EXPIRED`

**Why it matters:** A schema that doesn't include `DECLINED` will throw a parse
error the first time a declined document appears in the response — silently
breaking the test in production-like data, but passing on clean test data.

**Rule derived:** Always verify enum values against the real API response or
source code. Never trust AI-inferred enums from field names alone.

---

### 2. Hardcoded document IDs

**What happened:** The AI generated:
```typescript
test('GET /api/v1/documents/1 returns the document', async ({ request }) => {
  const res = await request.get(`${env.baseUrl}/api/v1/documents/1`, ...);
  expect(res.status()).toBe(200);
});
```

**Problem:** Document ID `1` may not exist in a fresh Docker environment. The
test is environment-dependent and will fail on first run without pre-seeded data.

**Fix applied:** Replaced with a fixture that creates a document via API in
`beforeEach` and deletes it in `afterEach` — using the `seededDocument` fixture
pattern already established in `tests/fixtures.ts`.

**Rule derived:** AI-generated tests default to hardcoded IDs. Always replace
with fixture-managed resources.

---

### 3. Schema validated only the happy-path shape

**What happened:** The AI generated one schema test asserting the response shape
on a 200. It did not generate:
- A test verifying the 404 body shape (`{ message: string }`)
- A test verifying the 401 body shape
- A test verifying pagination metadata types

**Why it matters:** Error response schemas drift too. A 404 that silently changes
from `{ message }` to `{ error }` will break consuming code without any test
catching it.

**Rule derived:** Generate schemas for error responses too, not just success
responses. Add as a follow-up prompt step.

---

### 4. Missing boundary tests

**What happened:** For the paginated list endpoint, the AI generated:
- `page=1` (happy path)
- `page=0` (invalid)

It missed:
- `page=999999` (beyond last page — should return empty `data: []`, not 404)
- `perPage=0` (zero page size)
- `perPage=101` (beyond max allowed)

**Why it matters:** Pagination boundary bugs are common and production-impacting
(they usually surface as infinite loops in consuming code, not 500 errors in the
API layer).

**Rule derived:** The AI generates obvious boundaries. SDET adds domain-specific
boundaries that require knowing how the feature is used downstream.

---

### 5. Inferred optional fields incorrectly

**What happened:** The AI marked `signers` as optional:
```typescript
signers: z.array(SignerSchema).optional()
```

**Actual behaviour:** `signers` is always present — it is an empty array `[]`
when no signers have been added, not absent.

**Why it matters:** `.optional()` means the field can be absent entirely.
`.default([])` or just `z.array(SignerSchema)` is correct. Using `.optional()`
causes downstream code to need null-checks that are never actually needed.

**Rule derived:** Verify every `.optional()` field against the real API response.
"Field may be empty" ≠ "field may be absent".

---

## Verdict and workflow

**AI generation is a first draft tool, not a finished output tool.**

The generated schema and test skeleton are useful as a starting point — they
produce roughly 60% of the boilerplate correctly and save ~20 minutes per
endpoint. But every generated file requires a review pass against these checks:

| Check | AI reliability |
|-------|---------------|
| Field names match real API | ✅ High (inferred from spec) |
| Field types (string/number/boolean) | ✅ High |
| Enum values complete | ❌ Low — always verify |
| Optional vs required vs nullable | ⚠️ Medium — verify nullable/optional |
| Hardcoded IDs replaced with fixtures | ❌ Always replace |
| Error response schemas present | ❌ Always add manually |
| Pagination boundary cases | ❌ Always add manually |
| Auth header format correct | ✅ High (Bearer token) |

**Time saved:** ~20 min per endpoint on boilerplate.
**Time added:** ~10 min per endpoint on review and correction.
**Net saving:** ~10 min per endpoint — worthwhile, but only if the review step
is not skipped.

---

## Using the script

```bash
# Install dependency first (one-time)
pnpm add -D @anthropic-ai/sdk

# Add to .env
echo "ANTHROPIC_API_KEY=your-key-here" >> .env

# Generate schema + test for the documents list endpoint
pnpm exec ts-node scripts/generate-test.ts \
  --endpoint "GET /api/v1/documents — returns paginated list. Response: { data: Document[], totalPages: number, currentPage: number, perPage: number }"

# Preview without writing files
pnpm exec ts-node scripts/generate-test.ts \
  --endpoint "DELETE /api/v1/documents/:id" \
  --dry-run

# Schema only
pnpm exec ts-node scripts/generate-test.ts \
  --endpoint "GET /api/v1/documents/:id" \
  --skip-test
```

Generated files land in:
- `schemas/generated/<name>.schema.ts`
- `tests/api/generated/<name>.spec.ts`

Both include a prominent `⚠️ AI-GENERATED FILE — REVIEW BEFORE COMMITTING` header
that must be removed manually after the review checklist above is complete.
