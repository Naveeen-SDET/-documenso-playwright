# Fixture Composition and Dependency Injection

**Author:** Naveen Kumar Manoharan  
**Applies to:** This Playwright + TypeScript framework for Documenso

---

## The problem fixtures solve

Imagine 10 tests that all need "a logged-in sender with a document in the database". Without fixtures, each one looks like this:

```typescript
test('reads a document', async ({ request }) => {
  // Same 10 lines in every test
  if (!process.env.DOCUMENSO_API_KEY) test.skip();
  const api = new DocumentsApi(request, env.baseUrl, env.apiKey);
  const doc = await api.create('./sample.pdf', 'test-doc');
  
  try {
    // Actual test — 2 lines
    const fetched = await api.getById(doc.id);
    expect(fetched.id).toBe(doc.id);
  } finally {
    await api.delete(doc.id);  // Manual teardown — forgotten half the time
  }
});
```

The same 10 lines of setup exist in all 10 tests. If you change the setup (e.g. rename the PDF, change the title format), you change it 10 times.

With the `senderWithDocument` fixture, the same test becomes:

```typescript
test('reads a document', async ({ senderWithDocument }) => {
  const { document, api } = senderWithDocument;

  // Test is just the assertion
  const fetched = await api.getById(document.id);
  expect(fetched.id).toBe(document.id);
});
```

No skip guard. No try/finally. No construction. The fixture handles all of it.

---

## What is dependency injection?

Dependency injection means: instead of building what you need inside a function, you DECLARE what you need and something else provides it.

In Playwright, you declare fixture dependencies in the function signature:

```typescript
// "I need authenticatedApi. Playwright: please build it and pass it in."
senderWithDocument: async ({ authenticatedApi }, use) => {
  // authenticatedApi is already built, already checked for API key,
  // already ready to use. We didn't build it — Playwright injected it.
}
```

This is the same concept you'll see in dependency injection frameworks like Angular's DI, NestJS, or Spring in Java. The idea transfers directly.

---

## The dependency chain

```
senderAndSigner
  └─ browser (Playwright built-in)

senderWithCompletedDocument
  └─ senderWithDocument
       └─ authenticatedApi  (from fixtures.ts)
            └─ request      (Playwright built-in)
                 └─ env.hasApiKey check → skip if absent

senderWithDocument
  └─ authenticatedApi  (from fixtures.ts)
       └─ request      (Playwright built-in)
```

When a fixture at any level skips — every fixture above it in the chain also skips. Automatically. No guard code needed in the dependent fixtures or in the tests.

---

## Three composed fixtures

### 1. `senderWithDocument`

**What it gives you:** `{ document: Document, api: DocumentsApi }`

**When to use it:** Any test that needs a real document in the database. The document is created before the test and deleted after — guaranteed, even if the test throws.

```typescript
test('document has DRAFT status after creation', async ({ senderWithDocument }) => {
  const { document } = senderWithDocument;
  expect(document.status).toBe('DRAFT');
});

test('document list includes the seeded document', async ({ senderWithDocument }) => {
  const { document, api } = senderWithDocument;
  const list = await api.list();
  const found = list.documents.find(d => d.id === document.id);
  expect(found).toBeDefined();
});
```

### 2. `senderWithCompletedDocument`

**What it gives you:** `{ document: Document, api: DocumentsApi }` (same shape)

**When to use it:** Tests that verify behaviour on a COMPLETED document (download, audit log, immutability). Currently provides a DRAFT document — extend the fixture to implement the full signing flow via Inbucket when needed.

**How chaining works:** This fixture takes `senderWithDocument` as a dependency. Playwright:
1. Runs `authenticatedApi` setup
2. Passes it to `senderWithDocument` setup
3. Passes that result to `senderWithCompletedDocument` setup
4. Gives the final result to your test

Your test only sees step 4. It has no idea about the chain.

### 3. `senderAndSigner`

**What it gives you:** `{ senderPage: Page, signerPage: Page }`

**When to use it:** Multi-party tests. The signing flow involves TWO users: the sender (who creates and sends) and the signer (who receives and signs). This fixture gives you a browser page for each — simultaneously, without logging in and out.

```typescript
test('sender sees pending, signer can open signing link', async ({ senderAndSigner }) => {
  const { senderPage, signerPage } = senderAndSigner;

  // Drive both users at the same time
  await senderPage.goto('/documents');
  await signerPage.goto(signingUrl);

  await expect(senderPage.locator('[data-status]')).toContainText('Pending');
  await expect(signerPage.locator('button:has-text("Sign")')).toBeVisible();
});
```

**Why two contexts, not one page that logs in and out?**

Logging out invalidates the sender's session. You'd have to log back in as sender to verify completion. That's slow, brittle, and unrealistic — a real sender never logs out just because the signer signed.

Two contexts mirror reality: both users are active simultaneously.

---

## The "skip propagation" guarantee

This is the most important property of fixture composition:

```
If authenticatedApi skips (no API key)
  → senderWithDocument skips (depends on authenticatedApi)
    → senderWithCompletedDocument skips (depends on senderWithDocument)
      → every test using either of those fixtures skips
```

None of those fixtures need a `if (!env.hasApiKey) testInfo.skip()` guard. The skip travels up the dependency chain automatically.

This means: your tests are clean. They only contain the assertion logic that's actually being tested.

---

## When to create a new composed fixture

Create a new composed fixture when you notice:

1. **The same 5+ lines appear in multiple `beforeEach` or test setup blocks** → extract to a fixture
2. **A test needs more than one "actor"** (sender + signer, admin + regular user) → dual-context fixture
3. **A test needs a specific pre-condition** (document in DRAFT / PENDING / COMPLETED state) → state-specific fixture

The rule of thumb: if you're writing the same setup twice, it belongs in a fixture.

---

## File locations

| File | Purpose |
|------|---------|
| `tests/fixtures.ts` | Base fixtures — POMs, `authenticatedApi`, `seededDocument` |
| `tests/fixtures.advanced.ts` | Worker scope, option fixtures, fixture composition (Day 61) |
| `tests/fixtures.composed.ts` | Domain fixtures — `senderWithDocument`, `senderAndSigner` |
| `tests/fixtures/composed-patterns.spec.ts` | Demonstration tests for the composed fixtures |
