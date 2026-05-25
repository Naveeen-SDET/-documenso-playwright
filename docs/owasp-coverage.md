# OWASP Top 10 Coverage Map

**Author:** Naveen Kumar Manoharan  
**Last updated:** 2026-05  
**Applies to:** This Playwright + TypeScript framework for Documenso  
**OWASP reference:** [OWASP Top 10:2021](https://owasp.org/Top10/)

---

## Summary

| # | OWASP Category | Coverage | Test files |
|---|---|---|---|
| A01 | Broken Access Control | ✅ Covered | `security.spec.ts`, `api-security.spec.ts` |
| A02 | Cryptographic Failures | ⚠️ Partial | `cookie-security.spec.ts`, `security-headers.spec.ts` |
| A03 | Injection | ✅ Covered | `input-validation.spec.ts`, `api-security.spec.ts` |
| A04 | Insecure Design | 🚫 App boundary | — |
| A05 | Security Misconfiguration | ✅ Covered | `security-headers.spec.ts`, `api-security.spec.ts` |
| A06 | Vulnerable and Outdated Components | 🚫 App boundary | — |
| A07 | Identification and Authentication Failures | ✅ Covered | `security.spec.ts`, `api-security.spec.ts` |
| A08 | Software and Data Integrity Failures | 🚫 App boundary | — |
| A09 | Security Logging and Monitoring Failures | ⚠️ Partial | `audit/audit.spec.ts` |
| A10 | Server-Side Request Forgery (SSRF) | 🚫 App boundary | — |

**Legend:**  
✅ Covered — automated tests verify this category  
⚠️ Partial — some aspects covered, others need dev-level access  
🚫 App boundary — not testable via black-box Playwright testing  

---

## Detailed breakdown

### A01 — Broken Access Control ✅

**What it means:** Users can act outside their intended permissions — accessing other users' data, elevating privileges, or bypassing authentication entirely.

**What we test:**

- Unauthenticated requests to `GET /api/v1/documents` return 400/401 (`security.spec.ts`)
- Invalid and tampered API tokens are rejected (`security.spec.ts`, `api-security.spec.ts`)
- JWT algorithm confusion (`alg:none`) is rejected — cannot forge a trusted token (`api-security.spec.ts`)
- Forged JWTs with admin claims are rejected — server validates signatures (`api-security.spec.ts`)
- Expired JWTs are rejected — `exp` claim is enforced (`api-security.spec.ts`)
- Protected UI routes redirect unauthenticated users to `/signin` (`security.spec.ts`)
- Path traversal in document IDs returns 4xx — cannot access arbitrary resources (`api-security.spec.ts`)

**What needs dev access to test:**
- Horizontal privilege escalation: can user A access user B's documents? (Requires two real accounts in the same test DB with seeded data)
- Admin-only endpoints: are there routes only admins can call? (Requires role-aware test accounts)

---

### A02 — Cryptographic Failures ⚠️

**What it means:** Sensitive data exposed due to weak/missing encryption — data in transit or at rest.

**What we test:**

- Session cookies have `Secure` flag — transmitted only over HTTPS (`cookie-security.spec.ts`)
- Session cookies have `HttpOnly` flag — not accessible via JavaScript (`cookie-security.spec.ts`)
- `SameSite` attribute is set — mitigates CSRF (`cookie-security.spec.ts`)
- Authenticated API responses set `Cache-Control: no-store` — not cached by proxies (`security-headers.spec.ts`)

**What needs dev access to test:**
- TLS version and cipher suite configuration (needs network-level access or sslscan)
- Database encryption at rest (needs infrastructure access)
- Whether API tokens are stored hashed or plaintext in the DB (needs DB access)
- Key rotation policy (organisational, not testable via Playwright)

---

### A03 — Injection ✅

**What it means:** Attacker-controlled data is interpreted as code or commands — SQL, OS commands, LDAP, XSS.

**What we test:**

**Via UI (input-validation.spec.ts):**
- XSS payloads in sign-in email and name fields — rendered as text, not executed
- SQL-injection strings in form fields — UI does not crash or expose DB errors
- Oversized inputs — page does not crash on very long strings
- Unicode/emoji in text fields — correct rendering, no encoding failures

**Via API directly (api-security.spec.ts):**
- SQLi in `?page` query parameter — server returns 400, not 500 with DB error
- SQLi patterns in search parameters — no DB engine name in error responses
- XSS in query parameters — reflected in JSON context, not HTML
- XSS payload as document title — API response does not execute the script
- CRLF injection in request headers — injected header does not appear in response
- Path traversal in document ID — 4xx response, no file system access

**What we confirmed works:** Documenso sanitises form input at the UI layer. API-level injection attempts return proper 4xx errors without database error messages.

---

### A04 — Insecure Design 🚫

**What it means:** Fundamental design flaws — missing rate limiting, missing threat modelling, insecure workflows by design.

**Why we can't fully cover this via Playwright:**
Rate limiting: we can observe that 429 responses exist, but we can't reliably trigger real rate limits against a local Docker stack (they may be disabled). A proper rate-limit test requires a load testing tool (k6, Locust) with precise RPS control.

**What we can observe:**
- 429 responses are handled gracefully by the UI (tested in `ui-only.spec.ts`)
- The server sets `Retry-After` headers on 429 responses (verified in mock tests)

**What needs dev access:**
- Confirming rate limits are configured on production endpoints
- Reviewing threat model documentation
- Reviewing signing flow for business logic flaws (e.g., can a signer sign on behalf of another signer?)

---

### A05 — Security Misconfiguration ✅

**What it means:** Insecure default configuration — missing security headers, verbose error messages, open CORS policies, exposed admin interfaces.

**What we test:**

- `X-Content-Type-Options: nosniff` — present on HTML pages and API responses (`security-headers.spec.ts`)
  - **KNOWN FINDING:** Documenso does not set this header — documented as Medium severity
- `Referrer-Policy` — controls URL leakage in Referer header (`security-headers.spec.ts`)
  - **KNOWN FINDING:** Documenso does not set this header — documented as Low-Medium severity
- `X-Frame-Options` or CSP `frame-ancestors` — clickjacking protection (`security-headers.spec.ts`)
- `X-Powered-By` not exposed — server technology not disclosed (`security-headers.spec.ts`)
- `Server` header version redacted — no version number in Server header (`security-headers.spec.ts`)
- CORS wildcard not set on authenticated endpoints (`api-security.spec.ts`)
- TRACE method disabled (`api-security.spec.ts`)
- Error responses contain no stack traces or internal paths (`security-headers.spec.ts`, `api-security.spec.ts`)
- Wrong Content-Type rejected cleanly — no 500 on unexpected content types (`api-security.spec.ts`)

---

### A06 — Vulnerable and Outdated Components 🚫

**What it means:** Using libraries with known CVEs.

**Why we can't cover this via Playwright:** Dependency scanning requires access to the `package.json` and running tools like `npm audit`, Snyk, or Dependabot. This is a CI pipeline concern, not a Playwright concern.

**What a complete security posture would include:**
- GitHub Dependabot alerts on the Documenso repo
- `pnpm audit` in the CI pipeline
- Automated PRs for security patches

---

### A07 — Identification and Authentication Failures ✅

**What it means:** Weak authentication — no brute force protection, credential stuffing, session fixation, missing MFA.

**What we test:**

- Invalid tokens rejected (`security.spec.ts`)
- Tampered tokens rejected (`security.spec.ts`)
- `alg:none` JWT rejected — algorithm confusion attack (`api-security.spec.ts`)
- Forged JWT with admin claims rejected (`api-security.spec.ts`)
- Expired JWT rejected — `exp` claim enforced (`api-security.spec.ts`)
- Malformed Bearer token formats rejected cleanly — no 500 (`api-security.spec.ts`)
- Wrong auth scheme rejected — only Bearer accepted (`api-security.spec.ts`)
- Session cookie attributes: `HttpOnly`, `SameSite`, `Secure` (`cookie-security.spec.ts`)
- Post-signout session invalidation — old cookie rejected after logout (`cookie-security.spec.ts`)

**What needs dev access:**
- Brute force protection: is there account lockout after N failed logins? (Requires many real login attempts)
- Password strength policy enforcement (needs account creation with weak passwords)
- MFA implementation (needs MFA-enabled test account)

---

### A08 — Software and Data Integrity Failures 🚫

**What it means:** Insecure deserialization, missing integrity checks on updates, insecure CI/CD pipelines.

**Why we can't cover this via Playwright:** This category requires access to the build pipeline (to verify signed artifacts), the update mechanism, and server-side deserialization logic.

**What we can observe:** The audit trail immutability check in `audit/audit.spec.ts` — `DELETE` and `PATCH` on audit log endpoints return 404. Audit logs cannot be tampered with via the REST API. This is a data integrity verification at the API boundary.

---

### A09 — Security Logging and Monitoring Failures ⚠️

**What it means:** Insufficient logging of security events — failed logins, access control violations, and suspicious inputs are not logged or alerted on.

**What we test:**

- The audit log exists and captures events (`audit/audit.spec.ts`)
- The audit log is immutable via REST — cannot be deleted or patched (`audit/audit.spec.ts`)
- 21-event taxonomy verified — DOCUMENT_CREATED, DOCUMENT_SENT, DOCUMENT_SIGNED, etc.

**What we cannot test via Playwright:**
- Whether failed authentication attempts generate log entries (needs log access)
- Whether alerts fire on repeated failed logins (needs SIEM access)
- Log retention policy (organisational, not testable via Playwright)

---

### A10 — Server-Side Request Forgery (SSRF) 🚫

**What it means:** The server makes requests to an attacker-controlled URL — can be used to access internal services (cloud metadata APIs, internal admin panels).

**Why we can't cover this via Playwright:** SSRF requires providing a URL to the server (e.g., a webhook URL or document import URL) and observing whether the server makes outbound requests to it. Testing this properly requires a controlled external server to receive the requests, and knowledge of which Documenso endpoints accept URLs as input.

**What a SSRF test would look like in practice:**
```
POST /api/v1/documents/import
{ "url": "http://169.254.169.254/latest/meta-data/" }
```
Then verify: does Documenso make a request to the AWS metadata endpoint? This requires infrastructure-level access to confirm.

---

## Interview answer

**"How do you approach security testing?"**

> I use the OWASP Top 10 as a framework rather than a checklist. For a Playwright suite, I can cover A01 (access control), A03 (injection), A05 (misconfiguration), and A07 (authentication) directly through API and UI tests. I document what the app boundary prevents me from testing — dependency scanning (A06), SSRF (A10), insecure design (A04) — and what needs dev-level access — horizontal privilege escalation, brute force thresholds, log verification.

> What I think matters most: the gap between UI validation and API validation. Most teams test through the UI and assume the backend is protected. I test the API directly with the same injection payloads, bypassing the frontend entirely. That's where real vulnerabilities hide — and that's exactly what an attacker with Burp Suite would do.

> In this framework, I found 3 real security header gaps in Documenso — missing `X-Content-Type-Options` and `Referrer-Policy` — that weren't documented anywhere. I annotated them as known findings with severity, impact, and fix recommendations rather than suppressing the failures.
