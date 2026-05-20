import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import fs   from 'fs';
import path from 'path';

/**
 * FlakyDetectorReporter — Custom Playwright Reporter
 *
 * What is a flaky test?
 * ─────────────────────
 * A test is flaky when it produces different results across runs without any
 * code change. The most common symptom: the test fails on the first attempt
 * but passes on retry. Playwright's `retries` config masks flakiness by
 * making the suite "green" — but the underlying instability remains hidden.
 *
 * What this reporter does:
 *   1. Watches every attempt of every test (onTestEnd fires once per attempt)
 *   2. If a test eventually passes but had at least one prior failure,
 *      it is marked as FLAKY
 *   3. On suite completion, writes test-results/flaky-tests.json listing
 *      every flaky test with its file, retry count, and first error
 *   4. Prints a console warning so flakiness is visible in CI logs
 *      even when the suite exits green
 *
 * Why this matters in interviews:
 *   "How do you prevent flaky tests from eroding team confidence?"
 *   Answer: detect them automatically on every run, surface them in CI,
 *   and treat them as P1 defects — they're silent lies in your test suite.
 *
 * Configuration in playwright.config.ts:
 *   reporter: [
 *     ['./reporters/flaky-detector.reporter.ts', { outputFile: 'test-results/flaky-tests.json' }],
 *   ]
 *
 * Output format (test-results/flaky-tests.json):
 *   {
 *     "runDate": "...",
 *     "flakyCount": 2,
 *     "flaky": [
 *       {
 *         "title": "Suite › Test name",
 *         "file": "tests/api/example.spec.ts",
 *         "attempts": 3,
 *         "firstError": "Expected 200 but got 503"
 *       }
 *     ]
 *   }
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface FlakyEntry {
  title:      string;   // full "Suite › Test" path
  file:       string;   // relative file path
  attempts:   number;   // total attempts (including the passing one)
  firstError: string;   // first line of the first failure message
}

interface ReporterOptions {
  outputFile?: string;
}

// ── Internal tracking structure ───────────────────────────────────────────────

interface TestRecord {
  title:       string;
  file:        string;
  failures:    number;
  passed:      boolean;
  firstError:  string;
  totalTries:  number;
}

// ── Reporter ──────────────────────────────────────────────────────────────────

class FlakyDetectorReporter implements Reporter {
  private readonly outputPath: string;
  private readonly records = new Map<string, TestRecord>();

  constructor(options: ReporterOptions = {}) {
    this.outputPath = options.outputFile ?? 'test-results/flaky-tests.json';
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    // Nothing to initialise — records are built lazily in onTestEnd
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const id    = test.id;
    const title = test.titlePath().join(' › ');
    const file  = path.relative(process.cwd(), test.location.file);

    // Retrieve or create the record for this test
    let record = this.records.get(id);
    if (!record) {
      record = { title, file, failures: 0, passed: false, firstError: '', totalTries: 0 };
      this.records.set(id, record);
    }

    record.totalTries++;

    if (result.status === 'passed' || result.status === 'expected') {
      record.passed = true;
    } else if (result.status === 'failed' || result.status === 'timedOut') {
      record.failures++;
      // Capture the first failure message (subsequent failures are less useful)
      if (record.failures === 1) {
        record.firstError = result.error?.message?.split('\n')[0]?.trim() ?? 'Unknown error';
      }
    }
  }

  onEnd(_result: FullResult): void {
    // A test is flaky if it PASSED but had at least one prior failure
    const flaky: FlakyEntry[] = [];

    for (const record of this.records.values()) {
      if (record.passed && record.failures > 0) {
        flaky.push({
          title:      record.title,
          file:       record.file,
          attempts:   record.totalTries,
          firstError: record.firstError,
        });
      }
    }

    // ── Write JSON report ───────────────────────────────────────────────────

    const report = {
      runDate:    new Date().toUTCString(),
      flakyCount: flaky.length,
      flaky,
    };

    const dir = path.dirname(this.outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.outputPath, JSON.stringify(report, null, 2), 'utf8');

    // ── Console output ──────────────────────────────────────────────────────

    if (flaky.length === 0) {
      console.log('\n✅ Flaky detector: no flaky tests detected');
    } else {
      console.warn(`\n⚠️  Flaky detector: ${flaky.length} flaky test(s) detected!`);
      for (const f of flaky) {
        console.warn(`   • ${f.title}`);
        console.warn(`     File:     ${f.file}`);
        console.warn(`     Attempts: ${f.attempts}`);
        console.warn(`     Error:    ${f.firstError}`);
      }
      console.warn(`\n   Full report → ${this.outputPath}`);
      console.warn('   Treat flaky tests as P1 — they are silent lies in your suite.\n');
    }
  }
}

export default FlakyDetectorReporter;
