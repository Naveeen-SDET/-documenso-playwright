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
 * MarkdownSummaryReporter — Custom Playwright Reporter
 *
 * Why write a custom reporter?
 * ─────────────────────────────
 * Playwright ships with list, dot, html, json, and junit reporters.
 * None of them produce a single human-readable Markdown file that can be:
 *   • committed to the repo as a run artefact
 *   • posted as a GitHub PR comment via a workflow step
 *   • attached to a Jira ticket or Confluence page
 *   • read by a non-engineer without opening a browser
 *
 * The Reporter interface has well-defined lifecycle hooks:
 *   onBegin    → suite starts    (record wall-clock start)
 *   onTestEnd  → each test ends  (accumulate pass/fail/skip counts)
 *   onEnd      → suite finishes  (write the Markdown file)
 *
 * Implementing this interface proves you understand Playwright internals
 * beyond just writing test cases — a differentiator for senior SDET roles.
 *
 * Output: test-results/summary.md  (path is configurable via reporter options)
 *
 * Usage in playwright.config.ts:
 *   reporter: [
 *     ['list'],
 *     ['./reporters/markdown-summary.reporter.ts', { outputFile: 'test-results/summary.md' }],
 *   ]
 *
 * Usage in CI (GitHub Actions):
 *   - name: Upload summary
 *     uses: actions/upload-artifact@v4
 *     if: always()
 *     with:
 *       name: test-summary
 *       path: test-results/summary.md
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface FailedTest {
  title:    string;   // full "Suite › Nested Suite › Test name" path
  file:     string;   // relative file path
  duration: number;   // milliseconds
  error:    string;   // first line of the error message
}

interface ReporterOptions {
  outputFile?: string;
}

// ── Reporter implementation ───────────────────────────────────────────────────

class MarkdownSummaryReporter implements Reporter {
  private passed   = 0;
  private failed   = 0;
  private skipped  = 0;
  private startMs  = 0;
  private failures: FailedTest[] = [];
  private readonly outputPath: string;

  constructor(options: ReporterOptions = {}) {
    this.outputPath = options.outputFile ?? 'test-results/summary.md';
  }

  // ── Lifecycle: suite begins ─────────────────────────────────────────────────

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.startMs = Date.now();
  }

  // ── Lifecycle: each test finishes ───────────────────────────────────────────

  onTestEnd(test: TestCase, result: TestResult): void {
    switch (result.status) {
      case 'passed':
        this.passed++;
        break;

      case 'failed':
      case 'timedOut':
        this.failed++;
        this.failures.push({
          title:    test.titlePath().join(' › '),
          file:     path.relative(process.cwd(), test.location.file),
          duration: result.duration,
          // Take only the first line — full stack traces belong in the HTML report
          error:    result.error?.message?.split('\n')[0]?.trim() ?? 'Unknown error',
        });
        break;

      case 'skipped':
      case 'interrupted':
        this.skipped++;
        break;
    }
  }

  // ── Lifecycle: suite finishes — write the Markdown file ────────────────────

  onEnd(result: FullResult): void {
    const totalMs  = Date.now() - this.startMs;
    const totalSec = (totalMs / 1000).toFixed(1);
    const total    = this.passed + this.failed + this.skipped;
    const passRate = total > 0 ? ((this.passed / total) * 100).toFixed(1) : '0.0';
    const isPass   = result.status === 'passed' || this.failed === 0;
    const badge    = isPass ? '✅ PASSED' : '❌ FAILED';
    const date     = new Date().toUTCString();

    // ── Build Markdown line by line ─────────────────────────────────────────

    const md: string[] = [
      `# Test Run Summary`,
      ``,
      `> **${badge}** — ${this.passed}/${total} passed (${passRate}%) in ${totalSec}s`,
      ``,
      `| | |`,
      `|---|---|`,
      `| **Date** | ${date} |`,
      `| **Duration** | ${totalSec}s |`,
      `| **Status** | ${badge} |`,
      ``,
      `## Results`,
      ``,
      `| Result | Count |`,
      `|--------|-------|`,
      `| ✅ Passed  | ${this.passed} |`,
      `| ❌ Failed  | ${this.failed} |`,
      `| ⏭ Skipped | ${this.skipped} |`,
      `| **Total** | **${total}** |`,
      ``,
    ];

    // ── Failed test details ─────────────────────────────────────────────────

    if (this.failures.length > 0) {
      md.push(`## Failed Tests`, ``);

      for (const [i, f] of this.failures.entries()) {
        md.push(
          `### ${i + 1}. ${f.title}`,
          ``,
          `| | |`,
          `|---|---|`,
          `| **File** | \`${f.file}\` |`,
          `| **Duration** | ${(f.duration / 1000).toFixed(2)}s |`,
          `| **Error** | ${escapeMarkdown(f.error)} |`,
          ``,
        );
      }
    } else {
      md.push(`## Failed Tests`, ``, `_No failures_ 🎉`, ``);
    }

    md.push(
      `---`,
      `*Generated by MarkdownSummaryReporter · [Full HTML report](../playwright-report/index.html)*`,
    );

    // ── Write to disk ───────────────────────────────────────────────────────

    const dir = path.dirname(this.outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.outputPath, md.join('\n'), 'utf8');
    console.log(`\n📋 Markdown summary → ${this.outputPath}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Escape pipe characters so error messages don't break Markdown tables. */
function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/`/g, "'");
}

export default MarkdownSummaryReporter;
