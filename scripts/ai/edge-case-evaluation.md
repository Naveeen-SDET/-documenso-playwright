# AI Edge-Case Evaluation — Review Decisions

> This document records the output of `scripts/suggest-edge-cases.ts` run against
> three existing test files, and my decisions on each suggestion.
>
> The decisions themselves are the artefact — they demonstrate the judgment call
> between "technically valid edge case" and "worth the maintenance cost."

---

## Run 1: `tests/api/documents-crud.spec.ts`

Command:
```bash
pnpm exec ts-node scripts/suggest-edge-cases.ts --file tests/api/documents-crud.spec.ts
```

### Suggestions received and decisions

**1. Concurrent DELETE — two requests for the same document ID sent simultaneously**
- Category: concurrency | Priority: P1
- Key assertion: one returns 200, the other returns 404 (not both 200, not a 500)
- **KEPT** — Race condition on delete is a real production scenario. A double-click
  on a delete button can fire two requests. Added to `document-lifecycle.spec.ts`.
  The fixture teardown pattern already handles the "second delete returns 404" case,
  so this was straightforward to implement.

**2. Document title with only whitespace characters**
- Category: data-boundary | Priority: P2
- Key assertion: API rejects with 400, not silently saves a blank-titled document
- **KEPT** — A document titled "   " would appear blank in the UI and in audit logs.
  Added to `documents-parameterized.spec.ts` BVA section.

**3. Requesting page -1 from the paginated list**
- Category: data-boundary | Priority: P2
- Key assertion: returns 400 or treats as page 1, does not throw 500
- **REJECTED** — Already covered in `documents-parameterized.spec.ts` (page=0 BVA
  tests cover the negative boundary). Page -1 maps to the same validation path as
  page=0 in Documenso's API layer — adding it would be testing the same code branch
  twice without additional confidence.

**4. Uploading a PDF where the filename contains path traversal characters (../)**
- Category: security | Priority: P1
- Key assertion: filename is sanitised in the response, `../` does not appear in
  the stored path or the audit log entry
- **KEPT** — Path traversal in filenames is an OWASP vulnerability (OTG-INPVAL-012).
  A signing platform stores PDFs — a malicious filename that resolves outside the
  upload directory is a real attack vector. Added to `input-validation.spec.ts`.

**5. Uploading a file with a .pdf extension but non-PDF content (magic bytes mismatch)**
- Category: security | Priority: P1
- Key assertion: API returns 400 or 422, does not process the file
- **KEPT** — MIME type validation should check magic bytes, not just extension.
  An attacker can rename a .js file to .pdf to attempt server-side execution.
  Added to `input-validation.spec.ts`.

**6. GET /documents with Accept: text/html instead of application/json**
- Category: data-boundary | Priority: P3
- Key assertion: API returns JSON regardless of Accept header
- **REJECTED** — Documenso's REST API does not perform content negotiation —
  it always returns JSON. Testing Accept header behaviour adds no coverage of
  code that doesn't exist. Low value, high noise.

**7. Creating a document and immediately deleting it before it leaves DRAFT state**
- Category: domain | Priority: P2
- Key assertion: delete succeeds, audit log captures both CREATE and DELETE events
- **DEFERRED** — Valid scenario but requires audit log read access, which is
  currently tRPC-only (documented gap in `tests/audit/audit.spec.ts`). Will
  revisit when tRPC testing is added.

**8. Authentication token used 1 second after expiry**
- Category: security | Priority: P1
- Key assertion: returns 401, not 200
- **REJECTED** — Cannot control token expiry timing in the test environment without
  mocking the clock or having a short-lived test token. The existing auth guard
  tests cover "expired token" as a static fixture. A timing-based test would be
  inherently flaky. The security is already covered by the static fixture approach.

---

## Run 2: `tests/security/security-headers.spec.ts`
Focus: `--focus security`

### Suggestions received and decisions

**1. Content-Security-Policy header — verify script-src does not include 'unsafe-inline'**
- Category: security | Priority: P1
- Key assertion: CSP header present and `script-src` does not contain `unsafe-inline`
- **KEPT** — `unsafe-inline` in CSP negates XSS protection entirely. Since we already
  check for CSP `frame-ancestors`, extending the test to check `script-src` is a
  natural follow-on. Added as a new test in `security-headers.spec.ts`.

**2. Strict-Transport-Security (HSTS) header on HTTPS origins**
- Category: security | Priority: P1
- Key assertion: `Strict-Transport-Security` present with `max-age` >= 31536000
- **KEPT** — HSTS prevents SSL-stripping attacks. Like the Secure cookie test,
  this only applies on HTTPS — added with the same localhost skip guard pattern.

**3. Permissions-Policy header to restrict browser features**
- Category: security | Priority: P2
- Key assertion: header present, restricts at minimum `camera`, `microphone`, `geolocation`
- **DEFERRED** — Documenso does not use camera/microphone/geolocation. While
  defence-in-depth suggests restricting them, their absence is not a vulnerability
  in the current threat model. Revisit if Documenso adds video signing features.

**4. Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy**
- Category: security | Priority: P2
- Key assertion: COOP header present to isolate browsing context
- **REJECTED** — COOP/COEP are headers for apps that use `SharedArrayBuffer` or
  cross-origin iframes. Documenso does neither. Testing for headers that serve no
  purpose in this app adds false signal — a "missing" header is not a finding here.

---

## Run 3: `tests/audit/audit.spec.ts`
Focus: `--focus domain`

### Suggestions received and decisions

**1. Audit log entry created when a signer views but does not sign**
- Category: domain | Priority: P1
- Key assertion: DOCUMENT_OPENED event appears in audit log when signing link is visited
- **DEFERRED** — Requires multi-user signing flow with email delivery (Inbucket).
  Valid and important — a "viewed" event is required under eIDAS for Advanced
  Electronic Signatures. Deferred to the multi-party signing flow days.

**2. Audit log timestamps are in UTC and ISO 8601 format**
- Category: domain | Priority: P2
- Key assertion: `createdAt` matches `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/`
- **KEPT** — In regulated industries, timestamp format inconsistency causes
  legal disputes over signing time. Already have `z.string().datetime()` in the
  schema, but added an explicit format assertion in the audit spec.

**3. Two documents created within the same second have different audit log entries**
- Category: domain | Priority: P2
- Key assertion: audit log IDs are unique even at sub-second granularity
- **REJECTED** — This tests the database's ID generation, not the application's
  behaviour. It would be testing infrastructure rather than the app under test.
  Not within the scope of an API test suite.

---

## Summary of decisions

| Decision | Count | Rationale |
|----------|-------|-----------|
| KEPT | 7 | Clear production risk, testable without infrastructure changes |
| REJECTED | 5 | Duplicate coverage, tests infrastructure not app, or YAGNI |
| DEFERRED | 3 | Valid but requires multi-party flow or tRPC access not yet available |

**Biggest pattern in rejected suggestions:** The AI frequently suggested testing
framework or infrastructure behaviour (database ID uniqueness, content negotiation
on an API that doesn't negotiate) rather than application behaviour. These look
like edge cases but test code the app doesn't own.

**Biggest pattern in kept suggestions:** Security-focused suggestions were
consistently high value — the AI correctly identified that an e-signature platform
has a higher security bar than a typical CRUD app.
