#!/usr/bin/env ts-node
/**
 * health-check.ts — TestOps API Health Check (Day 54)
 *
 * Runs every 6 hours via GitHub Actions cron (.github/workflows/health-check.yml).
 * Checks that the Documenso instance is alive and responding correctly.
 * On failure, fires a Slack webhook alert (or writes to JSON log if no webhook set).
 *
 * Usage:
 *   pnpm run health-check
 *   ts-node scripts/health-check.ts
 *
 * Environment variables:
 *   BASE_URL            — Documenso app URL
 *   DOCUMENSO_API_KEY   — API key for authenticated checks
 *   SLACK_WEBHOOK_URL   — Slack incoming webhook (optional — falls back to JSON log)
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// ── Types ─────────────────────────────────────────────────────────────────────

interface CheckResult {
  name: string;
  url: string;
  passed: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  error: string | null;
  detail: string;
}

interface HealthReport {
  timestamp: string;
  environment: string;
  baseUrl: string;
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  checks: CheckResult[];
  failureCount: number;
  alertSent: boolean;
}

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL    = process.env.BASE_URL ?? 'http://localhost:3000';
const API_KEY     = process.env.DOCUMENSO_API_KEY ?? '';
const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? '';
const ENV_NAME    = process.env.TEST_ENV ?? 'unknown';

const THRESHOLDS = {
  responseTimeWarningMs: 2000,   // warn if response takes longer than 2s
  responseTimeCriticalMs: 5000,  // fail if response takes longer than 5s
};

// ── Individual checks ─────────────────────────────────────────────────────────

async function runCheck(
  name: string,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  options: {
    headers?: Record<string, string>;
    expectedStatus: number | number[];
    expectedBodyKey?: string;
  }
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await axios({
      method,
      url,
      headers: options.headers ?? {},
      validateStatus: () => true,
      timeout: 8000,
    });

    const responseTimeMs = Date.now() - start;
    const expectedStatuses = Array.isArray(options.expectedStatus)
      ? options.expectedStatus
      : [options.expectedStatus];

    const statusOk = expectedStatuses.includes(res.status);
    const timeOk   = responseTimeMs < THRESHOLDS.responseTimeCriticalMs;
    const bodyOk   = options.expectedBodyKey
      ? typeof res.data === 'object' && res.data !== null && options.expectedBodyKey in res.data
      : true;

    const passed = statusOk && timeOk && bodyOk;

    let detail = `HTTP ${res.status} in ${responseTimeMs}ms`;
    if (!statusOk)   detail += ` (expected ${expectedStatuses.join(' or ')})`;
    if (!timeOk)     detail += ` (exceeded ${THRESHOLDS.responseTimeCriticalMs}ms threshold)`;
    if (!bodyOk)     detail += ` (missing key: ${options.expectedBodyKey})`;
    if (responseTimeMs > THRESHOLDS.responseTimeWarningMs && timeOk) {
      detail += ` ⚠️ slow (>${THRESHOLDS.responseTimeWarningMs}ms)`;
    }

    return { name, url, passed, statusCode: res.status, responseTimeMs, error: null, detail };
  } catch (err: unknown) {
    const responseTimeMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    return {
      name, url, passed: false, statusCode: null,
      responseTimeMs, error, detail: `Connection failed: ${error.slice(0, 100)}`,
    };
  }
}

// ── Run all health checks ─────────────────────────────────────────────────────

async function runAllChecks(): Promise<CheckResult[]> {
  const authHeaders = API_KEY
    ? { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }
    : {} as Record<string, string>;

  const checks = await Promise.all([
    // 1. App is reachable
    runCheck('App root reachable', 'GET', BASE_URL, {
      expectedStatus: 200,
    }),

    // 2. Signin page loads
    runCheck('Signin page loads', 'GET', `${BASE_URL}/signin`, {
      expectedStatus: 200,
    }),

    // 3. Auth guard enforced — unauthenticated request rejected
    runCheck('Auth guard: no token → 400', 'GET', `${BASE_URL}/api/v1/documents`, {
      expectedStatus: [400, 401],
    }),

    // 4. API responds to authenticated requests (only if API key is set)
    ...(API_KEY ? [
      runCheck('API: authenticated list → 200', 'GET', `${BASE_URL}/api/v1/documents`, {
        headers: authHeaders,
        expectedStatus: 200,
        expectedBodyKey: 'documents',
      }),

      // 5. Audit trail immutability still enforced
      // Accept 404 (endpoint not found) or 500 (server rejects) — both mean deletion failed.
      // FAIL only if 200/204 — that would mean audit logs were actually deleted (legal risk).
      runCheck('Audit trail: DELETE blocked (immutable)', 'DELETE',
        `${BASE_URL}/api/v1/documents/1/audit-logs`, {
          headers: authHeaders,
          expectedStatus: [404, 405, 500],
        }
      ),
    ] : []),
  ]);

  return checks;
}

// ── Determine overall status ──────────────────────────────────────────────────

function getOverallStatus(checks: CheckResult[]): 'HEALTHY' | 'DEGRADED' | 'DOWN' {
  const failures = checks.filter(c => !c.passed).length;
  if (failures === 0) return 'HEALTHY';
  if (failures < checks.length) return 'DEGRADED';
  return 'DOWN';
}

// ── Slack alert ───────────────────────────────────────────────────────────────

async function sendSlackAlert(report: HealthReport): Promise<void> {
  const emoji = report.overallStatus === 'DOWN' ? '🔴' : '🟡';
  const failed = report.checks.filter(c => !c.passed);

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${emoji} Documenso Health Check — ${report.overallStatus}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Environment:*\n${report.environment}` },
        { type: 'mrkdwn', text: `*Time:*\n${report.timestamp}` },
        { type: 'mrkdwn', text: `*Base URL:*\n${report.baseUrl}` },
        { type: 'mrkdwn', text: `*Failures:*\n${report.failureCount} / ${report.checks.length}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Failed checks:*\n${failed.map(c =>
          `• *${c.name}*: ${c.detail}`
        ).join('\n')}`,
      },
    },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `See <https://github.com/naveen-sdet/-documenso-playwright/blob/main/docs/runbook.md|runbook> for remediation steps.`,
      }],
    },
  ];

  await axios.post(WEBHOOK_URL, { blocks });
  console.log('✓ Slack alert sent');
}

// ── JSON log fallback (when no Slack webhook configured) ──────────────────────

function writeJsonLog(report: HealthReport): void {
  const logDir  = path.resolve('health-check-logs');
  const logFile = path.join(logDir, `health-${Date.now()}.json`);

  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(logFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(`📋 Health report written → ${logFile}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n🏥 Documenso Health Check — ${new Date().toISOString()}`);
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   API key: ${API_KEY ? '✓ set' : '✗ not set'}`);
  console.log(`   Slack:   ${WEBHOOK_URL ? '✓ configured' : '✗ not configured (JSON log fallback)'}\n`);

  const checks       = await runAllChecks();
  const overallStatus = getOverallStatus(checks);
  const failureCount  = checks.filter(c => !c.passed).length;

  // Print results
  for (const check of checks) {
    const icon = check.passed ? '✓' : '✘';
    console.log(`  ${icon} ${check.name.padEnd(45)} ${check.detail}`);
  }

  console.log(`\n  Overall: ${overallStatus} (${failureCount} failure(s) / ${checks.length} checks)\n`);

  const report: HealthReport = {
    timestamp:     new Date().toISOString(),
    environment:   ENV_NAME,
    baseUrl:       BASE_URL,
    overallStatus,
    checks,
    failureCount,
    alertSent:     false,
  };

  // Alert on any failure
  if (failureCount > 0) {
    if (WEBHOOK_URL) {
      try {
        await sendSlackAlert(report);
        report.alertSent = true;
      } catch (err) {
        console.error('⚠️  Failed to send Slack alert:', err instanceof Error ? err.message : err);
        writeJsonLog(report);
      }
    } else {
      console.log('⚠️  No SLACK_WEBHOOK_URL set — writing failure to JSON log');
      writeJsonLog(report);
    }
  }

  // Exit non-zero so GitHub Actions marks the run as failed
  if (overallStatus === 'DOWN' || overallStatus === 'DEGRADED') {
    console.error(`\n❌ Health check ${overallStatus} — see failures above`);
    process.exit(1);
  }

  console.log('✅ All checks passed\n');
}

main().catch(err => {
  console.error('\n❌ Health check script crashed:', err.message ?? err);
  process.exit(1);
});
