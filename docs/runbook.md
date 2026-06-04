# Runbook — Documenso Health Check Failures

This runbook covers remediation steps when the scheduled health check
(`.github/workflows/health-check.yml`) fires a Slack alert or exits non-zero.

---

## Alert types and what they mean

| Status | Meaning |
|---|---|
| `HEALTHY` | All checks passed — no action needed |
| `DEGRADED` | Some checks failed — investigate but not an outage |
| `DOWN` | All checks failed — full outage, act immediately |

---

## Check-by-check remediation

### `App root reachable` fails
**What it means:** `GET http://localhost:3000` returned a non-200 or timed out.

**Steps:**
1. Check if the Docker container is running: `docker ps | grep documenso`
2. If not running: `cd documenso-app && docker compose -f docker/testing/compose.yml up -d`
3. Check container logs: `docker logs documenso-test-documenso-1 --tail 50`
4. If the container is running but unhealthy, check Postgres: `docker logs documenso-test-database-1 --tail 20`
5. If Postgres is healthy but app is not: restart the app container: `docker restart documenso-test-documenso-1`

---

### `Signin page loads` fails
**What it means:** The Next.js frontend is not rendering.

**Steps:**
1. Check app container logs for Next.js build errors: `docker logs documenso-test-documenso-1 --tail 100`
2. Look for `NEXTAUTH_SECRET` or `DATABASE_URL` misconfiguration in logs
3. If a recent Documenso upstream update broke the build, pin to a known-good commit in the Docker Compose file

---

### `Auth guard: no token → 400` fails
**What it means:** The API is accepting unauthenticated requests. This is a **security regression**.

**Steps:**
1. This should be treated as a P0 security incident
2. Immediately check if a recent deployment removed auth middleware
3. Check git log for recent changes to auth-related files: `git log --oneline --all -- packages/api`
4. Do not wait for the next health check — manually verify with: `curl -s http://localhost:3000/api/v1/documents | jq .`
5. If the API is returning 200 without a token, take the environment offline until fixed

---

### `API: authenticated list → 200` fails
**What it means:** A valid API key is being rejected, or the documents endpoint is broken.

**Steps:**
1. Verify the API key is still valid: check the Documenso admin panel for active API keys
2. Try manually: `curl -H "Authorization: Bearer $DOCUMENSO_API_KEY" http://localhost:3000/api/v1/documents`
3. If key is expired, generate a new one and update the `DOCUMENSO_API_KEY` secret in GitHub Actions
4. If key is valid but still failing, check the database connection

---

### `Audit trail: DELETE → 404 (immutable)` fails — **CRITICAL**
**What it means:** The audit trail DELETE endpoint now returns something other than 404.
If it returns 200, audit logs can be deleted — this is a **legal compliance failure** under eIDAS.

**Steps:**
1. Treat as P0 immediately
2. Manually verify: `curl -X DELETE -H "Authorization: Bearer $DOCUMENSO_API_KEY" http://localhost:3000/api/v1/documents/1/audit-logs`
3. If the response is 200 or 204 (not 404), **do not allow any document signing on this instance until fixed**
4. Review the Documenso changelog for any API changes to the audit endpoint
5. File an issue with the Documenso project if this is an upstream regression

---

## Slow response warnings

If health checks pass but responses exceed 2000ms:

1. Check system resources on the host: `docker stats`
2. Check Postgres query performance: `docker exec -it documenso-test-database-1 psql -U documenso -c "SELECT * FROM pg_stat_activity;"`
3. If this is a staging/production environment, check whether the underlying VM is under load

---

## How to re-run the health check manually

From GitHub Actions:
1. Go to **Actions → Health Check**
2. Click **Run workflow** → **Run workflow**

From the command line (requires running Documenso):
```bash
pnpm run health-check
```

---

## How to silence a false positive

If the health check is firing due to a known planned maintenance window:

1. Disable the scheduled workflow temporarily via GitHub UI:
   **Actions → Health Check → ⋯ → Disable workflow**
2. Re-enable after maintenance is complete
3. Document the maintenance window in the commit message

---

## Escalation

| Severity | Condition | Action |
|---|---|---|
| P0 | Auth guard fails OR audit immutability fails | Take environment offline, fix immediately |
| P1 | App root or signin fails | Restart containers, investigate within 1 hour |
| P2 | Authenticated API fails | Investigate within 4 hours |
| P3 | Slow response warning only | Investigate within 24 hours |

---

*Health check source: `scripts/health-check.ts`*
*Workflow: `.github/workflows/health-check.yml`*
*Related: `docs/owasp-coverage.md`, `docs/gdpr-eidas.md`*
