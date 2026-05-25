# GDPR & eIDAS: Regulatory Test Coverage

**Author:** Naveen Kumar Manoharan  
**Last updated:** 2026-05  
**Applies to:** This Playwright + TypeScript framework for Documenso  
**Audience:** Engineering leads and QA managers hiring for UK legaltech/fintech roles

---

## Why this document exists

Documenso processes legally binding document signatures. That means two regulatory frameworks apply simultaneously:

- **UK GDPR / EU GDPR** — personal data of signatories is processed during every signing ceremony
- **eIDAS (UK & EU)** — the legal validity of the signature depends on which trust level the platform operates at

An SDET working on a product like this needs to understand both frameworks — not to give legal advice, but to know *what to test* and *why it matters*. This document maps the current test suite to those requirements and describes what tests would look like at each eIDAS trust level.

---

## Part 1 — GDPR

### What GDPR requires from an e-signing platform

When a signer completes a document on Documenso, personal data is processed: name, email address, IP address, timestamp, and the content of the signed document itself. The platform acts as a **data processor** on behalf of the sender (the data controller).

The key GDPR obligations that have testable surface area:

| Article | Requirement | Testable? |
|---|---|---|
| Art. 5 | Data minimisation — only collect what's necessary | ✅ Black-box |
| Art. 17 | Right to erasure — data subjects can request deletion | ✅ API-level |
| Art. 20 | Data portability — signatories can export their data | ✅ API-level |
| Art. 25 | Privacy by design — secure defaults, minimal disclosure | ✅ Via security tests |
| Art. 32 | Security of processing — encryption, access control, integrity | ✅ Via security + cookie tests |
| Art. 33 | Breach notification within 72 hours | 🚫 Organisational, not testable |
| Art. 13/14 | Transparency — privacy notice served at signing | ✅ UI-level |

---

### How the current test suite maps to GDPR

**Art. 5 — Data minimisation**

The signing page should collect only what's necessary: name, email, signature. It must not collect payment data, device fingerprinting beyond what's needed for the audit trail, or marketing opt-ins without explicit consent.

*Current coverage:* `tests/security/cookie-security.spec.ts` verifies cookies are scoped correctly and don't persist beyond session. `tests/security/security-headers.spec.ts` verifies Referrer-Policy — preventing URL leakage to third parties.

*Extension needed:* Verify the signing API only accepts and stores the fields documented in the privacy notice. Any unexpected field in the request body should be silently dropped, not stored.

```typescript
// Extension example — Art. 5 data minimisation test
test('signing API does not store undocumented fields', async ({ request }) => {
  const res = await request.post(`${env.baseUrl}/api/v1/documents/${id}/sign`, {
    headers: { Authorization: `Bearer ${signerToken}` },
    data: {
      name: 'John Doe',
      email: 'john@example.com',
      // Undocumented fields — should be silently dropped, not stored
      marketingConsent: true,
      socialSecurityNumber: '123-45-6789',
      bankAccount: 'GB29NWBK60161331926819',
    },
  });
  // Fetch the created record and verify undocumented fields are absent
  const stored = await getSigningRecord(res);
  expect(stored).not.toHaveProperty('socialSecurityNumber');
  expect(stored).not.toHaveProperty('bankAccount');
});
```

**Art. 17 — Right to erasure**

A signatory can request deletion of their data. The platform must be able to delete the signer's PII (name, email) while preserving the cryptographic integrity of the signed document for the sender's legal records. This is genuinely difficult — it's a tension between GDPR and contract law.

*Current coverage:* `tests/audit/audit.spec.ts` verifies the audit trail exists and is immutable via `DELETE /api/v1/documents/:id/audit-logs` → 404. This is the right default — audit logs must not be trivially deletable.

*Extension needed:* Verify that a dedicated "erase personal data" endpoint (if Documenso implements one) removes PII fields (name, email) from audit log entries while leaving the cryptographic hash and timestamp intact.

**Art. 25 — Privacy by design**

Technical defaults must be secure. The test suite already covers several Art. 25 requirements:

- `security-headers.spec.ts`: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- `cookie-security.spec.ts`: `HttpOnly`, `SameSite=Strict/Lax`, `Secure`
- `api-security.spec.ts`: No stack traces in error responses, CORS policy
- `security.spec.ts`: Protected routes redirect unauthenticated users

**Art. 32 — Security of processing**

Requires "appropriate technical and organisational measures." The test suite provides automated evidence of technical measures:

- Encryption in transit: `Secure` cookie flag, HTTPS-only (tested via Docker stack)
- Access control: auth guards tested in `security.spec.ts`
- Integrity: audit trail immutability in `audit/audit.spec.ts`
- Confidentiality: no sensitive data in error responses (`api-security.spec.ts`)

---

### GDPR tests to add when dev access is available

These require the ability to create and read back database records — not testable via pure black-box Playwright:

1. **PII not logged in server logs** — submit a signing request, check that the signer's email doesn't appear in plain text in application logs
2. **Data retention enforcement** — documents older than the configured retention period are automatically deleted or anonymised
3. **Consent timestamp recorded** — when a signer ticks "I agree", the precise UTC timestamp is stored in the audit trail
4. **Data export completeness** — the data portability endpoint (`GET /api/v1/data-export`) returns all PII associated with the requester, nothing more

---

## Part 2 — eIDAS Signature Trust Levels

### The three levels

eIDAS (and UK eIDAS) defines three trust levels for electronic signatures. Each has a different legal weight and different testing implications.

```
                          QES
                    ┌──────────────┐
                    │ Qualified    │ — Legal equivalent of handwritten signature
                    │ Electronic  │   Requires QSCD + qualified certificate
                    │ Signature   │   Highest legal admissibility
                    └──────────────┘
                          AES
                    ┌──────────────┐
                    │ Advanced    │ — Uniquely linked to signer, tamper-evident
                    │ Electronic  │   Identity verified before signing
                    │ Signature   │   Sufficient for most commercial contracts
                    └──────────────┘
                          SES
                    ┌──────────────┐
                    │ Simple      │ — Any digital indication of intent
                    │ Electronic  │   Typed name, checkbox, click-to-sign
                    │ Signature   │   Lowest legal weight, easiest to implement
                    └──────────────┘
```

**What Documenso provides:** Documenso is a click-to-sign platform. The signer draws/types their signature and clicks "Complete". This is **SES** by default — there is no identity verification beyond email-based authentication. With additional identity verification steps (phone OTP, ID document check), it can approach **AES**.

---

### What testing looks like at each level

#### SES — Simple Electronic Signature

**Legal basis:** The signer's intent is captured. There is a record that a person with access to that email address signed the document at that time.

**What to test:**

```typescript
// 1. Intent capture — the signature event is recorded
test('signing ceremony records intent timestamp', async () => {
  const auditLog = await getAuditLog(documentId);
  const signingEvent = auditLog.find(e => e.type === 'DOCUMENT_SIGNED');
  expect(signingEvent).toBeDefined();
  expect(signingEvent.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
});

// 2. IP address in audit trail — geo-binding of signature
test('signing event records IP address', async () => {
  const signingEvent = getSigningEvent(auditLog);
  expect(signingEvent.ipAddress).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
});

// 3. Email confirmation sent
test('signer receives confirmation email after signing', async () => {
  await completeSigning(signerToken);
  const inbox = await inbucket.getInbox(signerEmail);
  expect(inbox.some(m => m.subject.includes('signed'))).toBe(true);
});

// 4. Document hash recorded — tamper detection baseline
test('completed document has a recorded hash', async () => {
  const doc = await getDocument(documentId);
  expect(doc.documentHash ?? doc.hash ?? doc.checksum).toBeTruthy();
});
```

**Currently covered:** Events 1, 2, and 3 are partially covered in `audit/audit.spec.ts` and `email/email-delivery.spec.ts`. Event 4 (document hash) is a gap — Documenso's REST API does not expose the document hash directly.

---

#### AES — Advanced Electronic Signature

**Legal basis (eIDAS Art. 26):** Must be:
1. Uniquely linked to the signatory
2. Capable of identifying the signatory
3. Created using data under the signatory's sole control
4. Linked to the signed data so any change is detectable

**What moves from SES to AES in testing:**

```typescript
// 1. Identity verification before signing — not just email access
test('signer identity is verified before access to signing page', async () => {
  // AES requires more than just clicking a link in an email.
  // The test verifies that an additional verification step occurred
  // (OTP, ID document, liveness check) before the signature was accepted.
  const signingSession = await getSigningSession(token);
  expect(signingSession.identityVerification).toMatchObject({
    method:     expect.stringMatching(/otp|id_document|liveness/),
    verifiedAt: expect.any(String),
    passed:     true,
  });
});

// 2. Document hash integrity — signed content cannot be altered
test('document hash changes if content is modified post-signing', async () => {
  const originalHash = (await getDocument(documentId)).hash;
  await modifyDocumentContent(documentId); // simulate tampering
  const newHash = (await getDocument(documentId)).hash;
  expect(newHash).not.toBe(originalHash); // tamper detection works
});

// 3. Signature invalidated on tampering
test('certificate/signature is invalid if document is altered after signing', async () => {
  // For a fully AES-compliant implementation, a modified document's
  // cryptographic signature would fail verification
  const verificationResult = await verifySignature(tamperedDocument);
  expect(verificationResult.valid).toBe(false);
});

// 4. Audit trail chains events cryptographically
test('audit log events are chained (each event references the previous hash)', async () => {
  const events = await getAuditLog(documentId);
  for (let i = 1; i < events.length; i++) {
    expect(events[i].previousHash).toBe(hashOf(events[i - 1]));
  }
});
```

**Gap for Documenso:** Documenso does not currently implement identity verification beyond email OTP, cryptographic hash chaining in the audit log, or a public signature verification API. These tests would need to be built when those features are added.

---

#### QES — Qualified Electronic Signature

**Legal basis:** The legal equivalent of a handwritten signature across all EU member states and the UK. Requires:
1. A Qualified Electronic Signature Creation Device (QSCD) — a hardware token or HSM
2. A qualified certificate from a Trust Service Provider (TSP) on the EU/UK Trust List
3. Compliance with ETSI standards: PAdES (PDF), CAdES (CMS), XAdES (XML)

**What testing looks like at QES level:**

At QES level, Documenso would integrate with a TSP (like DocuSign's trust services, Entrust, or a national CA). The test surface changes significantly:

```typescript
// 1. Certificate is from a qualified TSP on the EU Trust List
test('signing certificate is from a qualified TSP', async () => {
  const cert = await getSigningCertificate(documentId);
  const trustList = await fetchEUTrustList();
  expect(trustList.isQualified(cert.issuer)).toBe(true);
});

// 2. Certificate validity at time of signing (OCSP check)
test('certificate was valid at the time of signing', async () => {
  const { cert, signingTimestamp } = await getSigningDetails(documentId);
  const ocspResponse = await checkOCSP(cert, signingTimestamp);
  expect(ocspResponse.status).toBe('good');
  expect(ocspResponse.revokedAt).toBeNull();
});

// 3. Signature conforms to PAdES standard (for PDF documents)
test('PDF signature conforms to PAdES-B-LT standard', async () => {
  const pdf = await downloadSignedPdf(documentId);
  const validation = await validatePAdES(pdf);
  expect(validation.conformanceLevel).toBe('PAdES-B-LT');
  expect(validation.signatureValid).toBe(true);
  expect(validation.certificateValid).toBe(true);
});

// 4. Timestamp from a Qualified TSA (Time Stamping Authority)
test('document timestamp is from a qualified TSA', async () => {
  const timestamp = await getTimestampToken(documentId);
  expect(timestamp.tsa).toMatch(/qualified/i);
  expect(timestamp.accuracy).toBeLessThanOrEqual(1); // within 1 second
});

// 5. Long-term validation — signature remains verifiable after cert expiry
test('LTV data embedded in signed document', async () => {
  const pdf = await downloadSignedPdf(documentId);
  // LTV (Long-Term Validation) requires OCSP responses and CRL data
  // embedded in the document so it can be verified after the cert expires
  const validation = await validatePAdES(pdf);
  expect(validation.hasLTVData).toBe(true);
});
```

**Reality check:** QES testing requires real TSP integration, QSCD hardware, and ETSI validation tools. This is not testable in a local Docker environment. It would be part of a dedicated compliance testing environment, likely run by a specialist test lab before regulatory approval.

---

## Summary table

| What to test | SES | AES | QES |
|---|---|---|---|
| Intent recorded (audit event) | ✅ | ✅ | ✅ |
| Timestamp in audit trail | ✅ | ✅ | ✅ |
| IP address recorded | ✅ | ✅ | ✅ |
| Email confirmation sent | ✅ | ✅ | ✅ |
| Document hash recorded | ✅ | ✅ | ✅ |
| Identity verification step | ❌ | ✅ | ✅ |
| Tamper detection (hash invalidated) | ❌ | ✅ | ✅ |
| Cryptographic signature on document | ❌ | ✅ | ✅ |
| Qualified certificate from TSP | ❌ | ❌ | ✅ |
| OCSP validity at time of signing | ❌ | ❌ | ✅ |
| PAdES/CAdES/XAdES compliance | ❌ | ❌ | ✅ |
| Qualified timestamp (TSA) | ❌ | ❌ | ✅ |
| Long-term validation (LTV) data | ❌ | ❌ | ✅ |

---

## Interview answer

**"How would your test approach change for a QES-level e-signature product?"**

> The test surface changes at every level. For SES — which is what most click-to-sign platforms implement — I'm testing intent capture, audit trail completeness, email confirmation, and tamper detection at the hash level. That's what this Documenso framework covers.

> For AES, I'd add identity verification step coverage (OTP or ID document check before signing), cryptographic signature validation (does a tampered document fail verification?), and audit trail chaining (each event hashes the previous one).

> For QES, the testing environment changes entirely. You're no longer running against a Docker stack — you need a qualified TSP integration, QSCD hardware, and ETSI validation tooling. Tests verify that the signing certificate is on the EU/UK Trust List, that OCSP was checked at the moment of signing, that the PDF conforms to PAdES-B-LT, and that LTV data is embedded for long-term verifiability. That kind of testing is typically done in a dedicated compliance environment before regulatory sign-off, not in a CI pipeline.

> The GDPR angle is about data minimisation and the right to erasure — which creates a genuine tension with the eIDAS requirement to preserve audit trails. The resolution is: you can erase PII (name, email) from audit log entries, but you must preserve the cryptographic hash and timestamp. The document remains legally valid; the signer's identity is just pseudonymised.
