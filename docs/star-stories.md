# STAR Stories — Interview Preparation

**Author:** Naveen Kumar Manoharan  
**Last updated:** 2026-05  
**Purpose:** Ready-to-use interview answers tied to real commits in this repository

Each story follows the STAR format: **Situation → Task → Action → Result**.  
Every story references a real commit hash that an interviewer can verify on GitHub.

---

## Story 1 — Real Security Finding in Production Open-Source Software

**Commit:** `d6e627b`  
**Question type:** "Tell me about a time you found a real bug / security issue"

### Situation

I was building an automated security test suite for Documenso — an open-source electronic signature platform used in regulated industries. I was writing OWASP OTG-CONFIG-007 tests to validate HTTP security response headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and others. The tests were running against the real Documenso application inside a Docker stack that matched the production configuration exactly.

### Task

My job was to verify that Documenso set all the security headers that OWASP and the Mozilla Observatory consider mandatory for a platform handling legally binding documents. I expected the tests to pass — these are basic headers that most modern frameworks set by default.

### Action

I ran the tests against the live Docker stack using `pnpm exec playwright test tests/security/security-headers.spec.ts`. Three tests failed consistently across multiple retries:

1. `X-Content-Type-Options: nosniff` — absent on all HTML page responses
2. `Referrer-Policy` — absent entirely, meaning authenticated page URLs could leak to third parties via the `Referer` header
3. `X-Content-Type-Options` — also absent on API responses

I confirmed these weren't test bugs by checking the raw HTTP headers with curl and cross-referencing against [securityheaders.com](https://securityheaders.com). These were genuine gaps.

Rather than deleting the failing tests or marking them as skipped — which would have hidden the findings — I used Playwright's `test.fail(true, 'KNOWN FINDING: ...')` annotation. This means:
- CI stays green (expected failure counts as a pass)
- The finding is permanently documented with severity, impact, and fix recommendation in the test code itself
- If Documenso ships a fix in a future release, the test automatically flips to "unexpectedly passed" — alerting the team to remove the annotation

I also added a **Known Security Findings** table to the project README with OWASP references, severity ratings, and the exact `next.config.js` code needed to fix all three issues.

### Result

Three confirmed OWASP OTG-CONFIG-007 and OTG-INFO-002 security gaps documented in an open-source platform with thousands of users. The findings are committed, reviewable, and self-updating — if Documenso merges the fix, the CI pipeline detects it automatically without anyone remembering to check.

This is the difference between a test suite that just verifies happy paths and one that actively hunts for security regressions. In a regulated-industry context — where these gaps could expose document URLs with auth tokens to third-party analytics services — finding them before a pen test saves significant remediation cost.

> **Commit:** `d6e627b` — "Document 3 confirmed Documenso security header gaps as known findings"  
> **File:** `tests/security/security-headers.spec.ts`

---

## Story 2 — Fixing a Silent CI Break in a Custom Reporter

**Commit:** `8809672`  
**Question type:** "Tell me about a time you debugged a difficult issue" / "Tell me about a time CI broke unexpectedly"

### Situation

I had built a custom Playwright reporter called `FlakyDetectorReporter` that watches every test attempt across CI runs and flags tests that pass on retry — detecting flakiness that Playwright's built-in retry mechanism hides. The reporter had been working for several weeks. Then I upgraded `@playwright/test` from 1.52 to 1.59 as part of keeping the framework current, and a TypeScript compilation error appeared in CI that nobody had noticed locally because local runs used `ts-node` which was less strict.

### Task

Fix the TypeScript error without breaking the flaky detection logic. The error was in the reporter's core loop — the section that decides whether a test run counts as a "pass" for flakiness detection purposes.

### Action

The error was on this line in `flaky-detector.reporter.ts`:

```typescript
// Before (broken)
if (result.status === 'passed' || result.status === 'expected') {
```

The TypeScript error was `TS2367: This condition will always be false` — the newer Playwright type definitions had removed `'expected'` from the `TestResult.status` union type. In earlier versions, `'expected'` was a valid status for tests annotated with `test.fail()` that actually failed (as expected). In newer versions, this was merged into `'passed'` semantically, and `'expected'` was removed from the type.

The fix was a single line change:

```typescript
// After (fixed)
if (result.status === 'passed') {
```

But the important part was understanding *why* `'expected'` had existed in the first place. I read the Playwright changelog and confirmed that `test.fail()` annotated tests that fail as expected now report `status: 'passed'` in the result object — because from the test suite's perspective, the expected outcome occurred. Removing `'expected'` from the check didn't lose any behaviour; it actually made the logic more accurate.

I then added a comment explaining the type change so the next person who touches this file understands the history.

### Result

CI compilation restored. The flaky detector continued working correctly — in subsequent runs it correctly identified 2 tests in the auth suite that were intermittently failing on the first attempt due to a timing issue in the storageState load sequence. Those were fixed separately.

More importantly: this story illustrates why custom infrastructure code needs the same maintenance discipline as test code. A reporter that silently stops compiling in CI is worse than no reporter — it creates a false sense that flakiness is being monitored when it isn't.

> **Commit:** `8809672` — "Fix flaky-detector reporter: remove deprecated 'expected' status from Playwright types"  
> **File:** `reporters/flaky-detector.reporter.ts`

---

## Story 3 — Contract Test That Proved It Could Catch Real Breaking Changes

**Commit:** `bbdcf78`  
**Question type:** "Tell me about a time you prevented a production incident" / "How do you approach API contract testing?"

### Situation

I was building Zod schema contract tests for the Documenso REST API. The team (hypothetically — this is an open-source project I'm testing) wanted confidence that if Documenso changed their API response shape, we'd catch it before it reached our integration layer. The challenge with contract tests is proving they actually work — a contract test that never fails gives you false confidence.

### Task

Write contract tests that: (1) validate the real API response shape on every CI run, and (2) include *negative* tests that prove the schema would catch a breaking change if one occurred.

### Action

First I wrote the positive contract tests — Zod schemas for every API response shape (`DocumentSchema`, `DocumentListSchema`, `RecipientSchema`, `AuditLogSchema`) and tests that fetch real responses and parse them:

```typescript
test('GET /documents response matches DocumentListSchema', async ({ request }) => {
  const res = await request.get(`${env.baseUrl}/api/v1/documents`);
  const body = await res.json();
  const result = DocumentListSchema.safeParse(body);
  expect(result.success, `Schema validation failed: ${JSON.stringify(result.error)}`).toBe(true);
});
```

But then I wrote the negative tests — which is where the real value is. I deliberately mutated the schema to make it stricter than the real API, confirmed the test failed, then restored it. For the permanent negative tests, I used `safeParse` with intentionally wrong data:

```typescript
test('DocumentSchema rejects a response missing required fields', () => {
  const incomplete = { title: 'Test' }; // missing id, status, createdAt, updatedAt
  const result = DocumentSchema.safeParse(incomplete);
  expect(result.success).toBe(false);
  // Verify the schema caught EXACTLY the missing fields
  const missingFields = result.error?.issues.map(i => i.path[0]);
  expect(missingFields).toContain('id');
  expect(missingFields).toContain('status');
});
```

This test proves two things at once: the schema validates correctly, AND it would catch a breaking change where Documenso removes or renames a required field.

I also set up a dedicated `schema-check` CI workflow that runs the contract tests on every PR — separate from the nightly regression — so breaking changes are caught at PR review time, not after merge.

### Result

The negative contract tests ran on every subsequent PR. During development, I caught one genuine schema mismatch: the `signingOrder` field on `RecipientSchema` was documented as `number` but the real API returned `null` for unsigned recipients. The Zod schema had it as `z.number()` which failed. Fixed to `z.number().nullable().optional()` — exactly the kind of silent API behaviour that would have caused a runtime crash in production code that destructured the field without null checking.

The key insight I always share in interviews: **a contract test that has never failed has never been proven to work**. The negative tests are what give you confidence the schema is actually enforcing the contract.

> **Commit:** `bbdcf78` — "feat: negative contract tests — schema proves it catches breaking changes, contract CI job"  
> **Files:** `tests/api/contracts-negative.spec.ts`, `schemas/document.schema.ts`, `.github/workflows/schema-check.yml`

---

## Story 4 — Rejecting AI-Generated Test Suggestions

**Commit:** `a17e5b1`  
**Question type:** "How do you use AI in your testing work?" / "Tell me about a time you had to push back on something"

### Situation

I had built a CLI script (`scripts/suggest-edge-cases.ts`) that reads an existing test file, sends it to Claude claude-haiku-4-5 with a structured prompt, and returns 8 suggested missing edge cases with priority ratings and reasoning. The goal was to use AI to surface blind spots in my test coverage. I ran it against three test files and received 15 suggestions in total.

### Task

Review all 15 AI suggestions critically and decide which to implement, which to defer, and which to reject outright — with written reasoning for each decision. The point was not to implement everything the AI suggested, but to use AI as a thinking partner while maintaining engineering judgment.

### Action

I documented every decision in `scripts/ai/edge-case-evaluation.md`. The most instructive rejections:

**Rejected: "GET /documents with Accept: text/html instead of application/json"**

The AI suggested testing that the API returns JSON regardless of the `Accept` header. Technically valid — content negotiation is a real concern. But Documenso's REST API does not perform content negotiation at all — it always returns JSON. Writing this test would be testing infrastructure that doesn't exist. If Documenso ever adds content negotiation, the test would need rewriting anyway. Verdict: **rejected** — tests code that doesn't exist.

**Rejected: "Authentication token used 1 second after expiry"**

The AI suggested testing that a token used 1 second after expiry returns 401. This sounds like a good security test. The problem: you cannot control token expiry timing in the test environment without either mocking the system clock (which the test framework doesn't support) or having a short-lived test token that would make the test inherently flaky — the timing window is too narrow to be reliable in CI. The existing static "expired token" fixture already covers this code path. Verdict: **rejected** — would be flaky, already covered by a more reliable approach.

**Rejected: "Requesting page -1 from the paginated list"**

The AI rated this P2 priority. But `page=-1` hits the exact same validation path in Documenso's API as `page=0`, which was already covered in `documents-parameterized.spec.ts`. Adding `-1` would test the same code branch twice, providing zero additional confidence while adding maintenance overhead. Verdict: **rejected** — already covered, not a distinct code path.

**Key insight I documented:** AI frequently suggested testing infrastructure behaviour (content negotiation, clock-dependent timing) rather than application behaviour. Out of 15 suggestions, 5 were rejected on this basis. The AI has no way to know which code paths actually exist in Documenso — it can only reason about what *could* exist based on general REST API knowledge.

### Result

7 of 15 suggestions implemented (in the appropriate test files), 5 rejected with written reasoning, 3 deferred pending tRPC access. The evaluation document itself became a portfolio artefact — it demonstrates that I use AI as a tool that improves my velocity without replacing my judgment.

The answer to "how do you use AI in testing" is not "I accept everything it suggests." It's "I use it to challenge my assumptions and surface blind spots, then I apply engineering judgment to decide what's worth building." The rejection decisions are often more valuable than the acceptances — they require deeper understanding of the codebase and the cost of test maintenance.

> **Commit:** `a17e5b1` — "Add AI edge-case suggestion CLI with reviewed evaluation of 15 suggestions across 3 test files"  
> **Files:** `scripts/suggest-edge-cases.ts`, `scripts/ai/edge-case-evaluation.md`

---

## Quick reference — story selection by question type

| Interview question | Best story |
|---|---|
| "Tell me about a real bug you found" | Story 1 — Security findings |
| "Tell me about a security issue you caught" | Story 1 — Security findings |
| "Tell me about a difficult debugging session" | Story 2 — Flaky detector fix |
| "Tell me about a time CI broke unexpectedly" | Story 2 — Flaky detector fix |
| "How do you prevent production incidents?" | Story 3 — Contract tests |
| "How do you approach API contract testing?" | Story 3 — Contract tests |
| "How do you use AI in your work?" | Story 4 — AI rejection |
| "Tell me about a time you pushed back" | Story 4 — AI rejection |
| "Tell me about a time you made a judgment call" | Story 4 — AI rejection |
| "What are you most proud of in this project?" | Story 1 or Story 3 |
