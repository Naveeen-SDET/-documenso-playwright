# Playwright Fixture Patterns

Three patterns beyond the basics, with the reasoning behind each.

## Why fixtures at all?

The short answer: guaranteed teardown.

`beforeEach`/`afterEach` breaks when a test crashes mid-run — `afterEach` may not
execute, leaving the database dirty for the next test. A fixture wraps setup and
teardown in a single function around `await use(...)`. Teardown always runs, even
when the test throws.

```typescript
myFixture: async ({}, use) => {
  const resource = await create();   // setup
  await use(resource);               // test runs here
  await destroy(resource);           // ALWAYS runs — pass or fail
}
```

---

## Pattern 1 — Worker scope

**File:** `tests/fixtures.advanced.ts` → `appReachable`

Normal fixtures run **once per test**. Worker-scoped fixtures run **once per
parallel worker** — shared by all tests that worker handles.

```typescript
appReachable: [async ({}, use) => {
  // runs once when the worker boots
  await axios.get(env.baseUrl, { timeout: 5_000 });
  await use(env.baseUrl);
}, { scope: 'worker' }],
```

**When to use it:**
| Use worker scope | Don't use worker scope |
|---|---|
| Connectivity check | Creating a document a test will modify |
| Reading a shared config file | Anything that needs isolation between tests |
| Expensive DB snapshot (read-only) | Login session (each test may need its own) |

**The rule:** if two tests sharing the fixture value would interfere with each
other, it cannot be worker-scoped.

---

## Pattern 2 — Option fixtures

**File:** `tests/fixtures.advanced.ts` → `documentTitle`

An option fixture is a fixture whose **default value can be overridden** by the
caller using `test.use()`. The fixture itself holds the value — other fixtures
read it.

```typescript
// declaration (in fixtures.advanced.ts)
documentTitle: ['auto-generated', { option: true }],

// override in a describe block (in a test file)
test.describe('invoice upload', () => {
  test.use({ documentTitle: 'invoice-test-doc' });

  test('...', async ({ seededTitledDocument }) => {
    // seededTitledDocument used 'invoice-test-doc' as the title
  });
});
```

**The analogy:** it's like passing arguments to `beforeEach`, but without
`beforeEach`. The describe block configures the fixture; the fixture reads the
config. Zero duplication.

---

## Pattern 3 — Fixture composing a custom fixture

**File:** `tests/fixtures.advanced.ts` → `seededTitledDocument`

A fixture can declare another **custom fixture** as a dependency — not just
built-ins like `page` or `request`. Playwright resolves the dependency graph:

```
seededTitledDocument
  └─ depends on: authenticatedApi  (our fixture from fixtures.ts)
  └─ depends on: documentTitle     (option fixture above)
       └─ authenticatedApi depends on: request (Playwright built-in)
```

Playwright runs them in the right order. If `authenticatedApi` skips the test
(because `DOCUMENSO_API_KEY` is absent), `seededTitledDocument` skips
automatically — no extra guard needed.

```typescript
seededTitledDocument: async ({ authenticatedApi, documentTitle }, use, testInfo) => {
  // authenticatedApi is already set up — Playwright called its setup first.
  // documentTitle is whatever the caller set (or 'auto-generated').
  const doc = await authenticatedApi.create(SAMPLE_PDF, title);
  await use(doc);
  await authenticatedApi.delete(doc.id); // teardown
},
```

**Why this matters:** you never re-implement the API-key skip logic.
Changes to `authenticatedApi` propagate to every fixture that depends on it
automatically.

---

## Choosing the right pattern

| Situation | Pattern |
|---|---|
| Setup is expensive and safe to share across tests | Worker scope |
| Same fixture needed with slightly different config | Option |
| New fixture needs something another fixture already provides | Compose |
| One-off setup that belongs to a single test | `beforeEach` is fine |

## Interview answer

> "What's the difference between a Playwright fixture and beforeEach?"

Fixtures guarantee teardown even when a test crashes. `afterEach` can be skipped
if the test throws before it's reached, leaving state behind for the next test.
Fixtures also compose — one fixture can depend on another, and Playwright wires
them up in the right order. You declare what a test needs; the framework handles
when and how to set it up.
