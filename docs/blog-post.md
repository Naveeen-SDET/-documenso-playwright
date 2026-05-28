# Testing an e-signature platform: what I actually learned

*Published on Dev.to / Medium — May 2026*  
*By Naveen Kumar Manoharan — SDET, London*

---

I spent the last two months building a production-grade test framework for [Documenso](https://documenso.com) — an open-source electronic signature platform. 175 tests. Two CI pipelines. Three real security findings. Here is what I learned that no tutorial ever told me.

---

## The product shaped every testing decision

Most SDET portfolio projects test a to-do app or a weather API. I wanted something with real stakes.

Documenso handles legally binding document signatures. That changes everything about what matters to test. Audit trail immutability isn't a nice-to-have — it's a legal requirement. Missing a security header isn't a cosmetic issue — it could leak a document URL with an auth token to a third-party analytics server via the `Referer` header. WCAG 2.1 AA accessibility isn't box-ticking — it's a UK Equality Act 2010 obligation.

When the product has genuine stakes, testing decisions have genuine rationale. That's the environment I wanted to work in.

---

## I found three real security gaps in production open-source software

This was the most unexpected outcome of the project.

I was writing OWASP OTG-CONFIG-007 tests to verify HTTP security response headers. I expected them to pass — these are basic headers that most modern frameworks set by default. Three failed consistently:

1. `X-Content-Type-Options: nosniff` — absent on all HTML page responses
2. `Referrer-Policy` — absent entirely
3. `X-Content-Type-Options` — also absent on API responses

I confirmed these weren't test bugs by checking raw HTTP headers with curl and cross-referencing against [securityheaders.com](https://securityheaders.com). These were genuine gaps in a platform used by thousands of people in regulated industries.

The engineering decision I'm most proud of: I didn't delete the failing tests. I didn't mark them as skipped. I used Playwright's `test.fail(true, 'KNOWN FINDING: ...')` annotation. CI stays green. The findings are permanently documented with severity, impact, and fix recommendation in the test code itself. If Documenso ships a fix in a future release, the test automatically flips to "unexpectedly passed" — alerting the team to remove the annotation.

That's the difference between a test suite that verifies happy paths and one that hunts for security regressions.

---

## The API layer is the product — test it like one

Teams test through the UI and assume the backend is protected. I learned to test the API directly with the same attack payloads an attacker with Burp Suite would use.

Some things I tested that most Playwright suites never touch:

- **`alg:none` JWT bypass** (CVE-2015-9235 class) — a crafted token with no signature algorithm. If the server accepts it, you can forge any identity.
- **SQL injection in query parameters** — not just `?search=<payload>` but `?page=1 OR 1=1`, `?page='; DROP TABLE--`. The test checks that the server returns 400, not 500 with a database error.
- **Path traversal in document IDs** — `../../../etc/passwd` as a document ID. Should return 4xx, not expose file contents.
- **CRLF injection in request headers** — injecting `\r\n` into header values. If reflected in the response, an attacker can inject arbitrary response headers.

The gap between UI validation and API validation is where real vulnerabilities hide. Most teams test through the UI and assume validation happens there. Attackers bypass the UI entirely.

---

## Contract tests that had never failed had never been proven to work

I built Zod schema contract tests for every API response shape. Positive tests: fetch real responses, parse them against the schema, fail if the shape changes.

But the critical insight came when I wrote the *negative* tests — tests that prove the schema would catch a breaking change if one occurred. I deliberately constructed payloads with missing required fields and verified the Zod schema rejected them with exactly the right error paths.

During development, this caught a real mismatch: the `signingOrder` field on recipient objects was documented as `number` but the real API returned `null` for unsigned recipients. The schema had it as `z.number()`. That would have caused a silent runtime crash in any production code that destructured the field without null checking.

**A contract test that has never failed has never been proven to work.** The negative tests are what give you confidence.

---

## Mock everything — but only what you actually own

The hardest testing decision in this project was when to mock the API and when to hit the real thing.

I came up with a rule I call the **tautology trap**: never mock what you're testing. If I'm testing that the documents API returns a paginated list, mocking the documents API means I'm just testing that my mock works. The test becomes a tautology.

But mocking has genuine value for things the real API can't reliably provide:
- Error states (503, 429, network abort) — a healthy local Docker stack will never return these
- Slow responses — you can't artificially delay a real API in a deterministic way
- Partial failures — CDN serving assets while the backend is down
- Transient failures — 500 on first attempt, 200 on retry (tests whether the UI retries at all)

I built a handler factory layer in the style of Mock Service Worker — centralised, named, typed. `documentHandlers.with503(page)`. `documentHandlers.withTransientFailure(page)`. Single source of truth. No copy-paste of `route.fulfill()` calls across 14 test files.

---

## Regulatory knowledge changed what I chose to test

Documenso falls under two regulatory frameworks simultaneously: UK GDPR (personal data of signatories) and eIDAS (legal validity of the signature). Understanding both changed which tests I wrote.

**The GDPR/eIDAS tension:** GDPR Article 17 gives signatories the right to request erasure of their data. But eIDAS requires audit trail preservation for legal validity. The resolution — which I documented explicitly — is that you can erase PII (name, email) from audit log entries while preserving the cryptographic hash and timestamp. The document remains legally valid; the signer's identity is pseudonymised.

I also mapped Documenso's current implementation to eIDAS trust levels. It operates at SES (Simple Electronic Signature) — click-to-sign, email authentication. I documented what testing would look like at AES (identity verification step, hash chaining) and QES (qualified certificate from a Trust Service Provider, PAdES compliance, OCSP validation). QES testing requires a compliance lab, not a Docker stack.

Most SDETs in a legaltech interview will be asked what eIDAS means. I can explain what it means for the *test surface* specifically — which is a different answer.

---

## AI suggested testing code that didn't exist

I built a CLI that reads a test file, sends it to an LLM with a structured prompt, and returns suggested missing edge cases. I ran it across three test files and got 15 suggestions.

Five I rejected outright. The pattern: AI consistently suggested testing infrastructure behaviour rather than application behaviour. "Test that the API returns JSON regardless of the `Accept` header" — content negotiation that Documenso doesn't implement. "Test a token used 1 second after expiry" — clock-dependent timing that would be inherently flaky in CI.

The AI has no way to know which code paths actually exist in the application. It reasons about what *could* exist based on general REST API knowledge. The rejections required deeper understanding of the codebase than the acceptances. I documented every decision with written reasoning — which became its own portfolio artefact.

The honest answer to "how do you use AI in testing" isn't "I accept what it suggests." It's "I use it to challenge my assumptions, then I apply engineering judgment."

---

## What I'd tell someone starting a similar project

**Pick a target with real stakes.** Happy-path tests against a CRUD app don't demonstrate judgment. A regulated-industry product forces you to make defensible decisions about what to test and why.

**Document your findings, don't suppress them.** Three failing tests became the strongest talking point in my portfolio. `test.fail()` with a KNOWN FINDING annotation is more valuable than a green suite that hides real gaps.

**Test the API like an attacker, not like a developer.** Every team tests through the UI. Fewer test what happens when you bypass it entirely.

**A test that has never failed has never been proven to work.** Write negative tests that prove your positive tests are real.

---

*The full framework is on [GitHub](https://github.com/naveen-sdet/-documenso-playwright): 175+ tests, 2 CI pipelines, OWASP Top 10 coverage map, GDPR/eIDAS documentation.*
