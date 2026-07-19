# When to Mock vs When to Use the Real API

**Author:** Naveen Kumar Manoharan  
**Last updated:** 2026-05  
**Applies to:** This Playwright + TypeScript framework for Documenso

---

## The core principle

> **Mock what you don't own. Use the real thing for what you do own.**

If your test is about how the UI _reacts_ to data, mock the data.  
If your test is about whether the backend _produces_ the right data, use the real API.

Mocking the wrong layer gives you tests that pass when the product is broken.

---

## Decision matrix

| Scenario | Use real API | Use mock | Reason |
|---|---|---|---|
| CRUD document lifecycle (create, read, delete) | ✅ | ❌ | Tests the actual database + business logic |
| Auth flow (login, logout, session enforcement) | ✅ | ❌ | Session state must come from the real server |
| API contract validation (Zod schema tests) | ✅ | ❌ | Contracts test the real response shape — mocking defeats the purpose |
| Audit trail immutability | ✅ | ❌ | Must verify real DB behaviour, not mock behaviour |
| Happy-path signing flow | ✅ | ❌ | Integration across email, DB, PDF generation |
| Error state: 500, 503, 429 | ❌ | ✅ | Hard to produce without breaking the server |
| Empty state: zero documents | ❌ | ✅ | Hard to guarantee in a shared test DB |
| Edge-case data: 150-char title, XSS in title | ❌ | ✅ | Real API would reject or sanitise — UI never sees it |
| Slow response / cold start simulation | ❌ | ✅ | Can't reliably slow down a real backend per-test |
| Offline / firewall block simulation | ❌ | ✅ | Can't take the real server offline per-test |
| Third-party service (email provider, PDF renderer) | ❌ | ✅ | External dependency — test isolation requires mock |
| Loading / spinner state | ❌ | ✅ | Real API is too fast for loading states to be testable |
| Pagination with exactly N documents | ❌ | ✅ | Hard to guarantee DB row count in shared environments |

---

## The tautology trap

**Never mock what you are testing.**

```typescript
// ❌ Wrong — this tests the mock, not the app
await page.route('**/api/v1/documents**', route =>
  route.fulfill({ status: 200, body: JSON.stringify({ documents: [...], totalPages: 1 }) })
);
// Now testing whether React renders the data you just invented — not whether the API returns it.

// ✅ Right — use real API when testing the data layer
const res = await request.get('/api/v1/documents');
const body = await res.json();
DocumentListSchema.parse(body);  // Contract test — catches real API shape changes
```

If you mock the API and then assert the UI shows the data you mocked, you have proved nothing about the system. You've only proved that React can render the array you hardcoded.

---

## The four failure modes mocking fixes

### 1. Error states are impossible to reproduce reliably against a real backend

To test a 500, you'd need to break your server. Mocking lets you inject it cleanly:

```typescript
await documentHandlers.with500(page);
```

### 2. Edge-case data the API sanitises or rejects

A 150-character document title might be rejected at the API layer (validation error). But the UI team might still need to handle it — because legacy data, a third-party integration, or a future API version might produce it. Mocking bypasses the API validation to test the UI in isolation:

```typescript
await documentHandlers.withLongTitles(page);
```

### 3. Empty states in a shared test database

If tests run in parallel against a shared DB, you can never guarantee zero documents. Mocking gives you a clean empty state every time:

```typescript
await documentHandlers.withEmpty(page);
```

### 4. Timing-dependent states (loading spinners, slow responses)

Real APIs respond in <100ms on a local Docker stack. The loading spinner appears for 50ms — not reliably testable. Artificial delay exposes it:

```typescript
await documentHandlers.withDelay(page, 2000);
```

---

## The three things mocking can't fix

### 1. Integration gaps

The most famous class of bugs in software engineering: unit tests pass, integration fails. If you mock the API in every test, you'll never catch that the frontend sends the wrong field name, or the backend changed its response shape, or the auth header format changed.

**Fix:** Contract tests with Zod against the REAL API. See `tests/api/contracts.spec.ts`.

### 2. Auth and session logic

Session tokens, CSRF, cookie attributes — these all depend on real server behaviour. Mocking auth means you never test what happens when the actual session expires, or when the server rejects a malformed token.

**Fix:** The `setup` Playwright project creates real sessions. Auth tests in `tests/auth/` always use the real app.

### 3. Race conditions and timing bugs

A real backend introduces real latency, real concurrency. A mock returns instantly and synchronously. Flaky timing bugs that only appear under load will never surface in a mock-only suite.

**Fix:** Load testing is out of scope for a Playwright suite. Use k6 or Locust for that. Playwright tests the functional layer; performance tests are separate.

---

## File structure in this project

```
mocks/
  fixtures.ts     — Typed mock response bodies (single source of truth)
  handlers.ts     — Named route handler factories (MSW-style)

tests/network/
  network.spec.ts         — Basic route mocking patterns (baseline)
  api-failures.spec.ts    — Deep failure simulation: 500/503/429/slow/abort
  ui-only.spec.ts         — UI-only test lane — never touches real backend
```

### Adding a new mock handler

1. Add fixture data to `mocks/fixtures.ts`
2. Add a named handler to `mocks/handlers.ts`
3. Import and use in your test:

```typescript
import { documentHandlers } from '../../mocks/handlers';

test('shows empty state', async ({ page }) => {
  await documentHandlers.withEmpty(page);
  await page.goto('/documents');
  // assert...
});
```

---

## Summary for interviews

**"When do you use mocks?"**

> I mock three things: states that are hard to produce against a real backend (errors, empty states, edge-case data), timing-dependent states (slow responses, loading spinners), and third-party dependencies I don't control. I don't mock what I'm testing — contract tests and CRUD tests always hit the real API, because mocking them would be circular.

> In this framework, all mock handlers live in `mocks/handlers.ts` — a single source of truth, named and typed. Tests import a handler and apply it. No copy-paste of `route.fulfill()` calls across files. When the API schema changes, there's one place to update.
