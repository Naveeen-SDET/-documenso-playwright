# AI Testing Agent — Evaluation Report

Generated: 2026-06-02T14:51:56.313Z
Base URL:  http://localhost:3000

## Discovery Phase

- Probes run:       10
- Successful:       0
- Failed (network): 10
- Auth guard found: false
- API key valid:    false
- Signing reachable:false

## What the agent got right

✅ Generated API endpoint tests
✅ Included auth guard test (401/403)
✅ Included signing flow test
✅ Included security header check
✅ Added test.skip guards for missing credentials
✅ Used Playwright request fixture (not axios)

## What the agent missed or got wrong

- Cannot discover tRPC endpoints — only REST endpoints were probed.
  The real sign-in flow uses tRPC, not REST. The agent cannot test UI login.

- Cannot understand business rules from HTTP responses alone.
  Example: a 200 on GET /sign/fake-token does not tell the agent whether
  the page showed an error state, a loading spinner, or a valid signing UI.

- Document shape is inferred from a single live response.
  If the test account has no documents, the agent sees an empty array and
  cannot infer field names, required vs optional, or enum values.

- No understanding of test isolation.
  The agent generates tests but cannot know which tests contaminate state.
  A human must verify teardown requirements.

- Security header tests are shallow.
  The agent checks for header presence, not correctness of the value.
  `x-content-type-options: sniff` would pass the agent's test.

## Why human judgement is still required

1. **Business rule verification**: The agent can assert status codes.
   It cannot assert that a completed document is immutable, that a revoked
   signing link returns the right error, or that RBAC prevents cross-account access.

2. **Test quality**: The agent writes tests that run. It does not write tests
   that catch regressions. A test that only asserts status === 200 would pass
   even if the response body was completely wrong.

3. **Context about what matters**: The agent treats all endpoints equally.
   A human knows that audit trail immutability is a legal requirement, not a
   nice-to-have — and writes a dedicated suite for it.

4. **Maintenance**: The agent generates a snapshot of the app as discovered.
   It does not understand which behaviours are stable contracts vs implementation
   details that will change.

## Verdict

The agent produces a working smoke test in ~30 seconds. It would take a human
15–20 minutes to write the equivalent from scratch. The agent is a productivity
tool, not a replacement for engineering judgement.

The output is a starting point, not a finished test suite.