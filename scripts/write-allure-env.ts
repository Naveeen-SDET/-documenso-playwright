/**
 * write-allure-env.ts
 *
 * Writes allure-results/environment.properties before a test run.
 * Allure reads this file and displays the values in the "Environment"
 * widget on the report overview page.
 *
 * Why this matters:
 *   When you open a two-week-old Allure report you need to know exactly
 *   what was tested: which app version, which environment, which CI run.
 *   Without this file, every report looks identical — you can't tell
 *   a local dev run from a production smoke.
 *
 * Usage:
 *   pnpm exec ts-node scripts/write-allure-env.ts
 *   (run automatically via pretest:allure npm script)
 */

import fs   from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const outputDir  = path.resolve('allure-results');
const outputFile = path.join(outputDir, 'environment.properties');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// ── Gather environment data ───────────────────────────────────────────────────

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const gitCommit  = safeExec('git rev-parse --short HEAD');
const gitBranch  = safeExec('git rev-parse --abbrev-ref HEAD');
const nodeVersion = process.version;
const runDate     = new Date().toISOString();

const props: Record<string, string> = {
  'App':          'Documenso',
  'Base.URL':     process.env.BASE_URL     ?? 'http://localhost:3000',
  'Environment':  process.env.TEST_ENV     ?? 'local',
  'Branch':       gitBranch,
  'Commit':       gitCommit,
  'Node.Version': nodeVersion,
  'Run.Date':     runDate,
  'CI':           process.env.CI           ?? 'false',
  'GitHub.Run':   process.env.GITHUB_RUN_ID ?? 'local',
};

// ── Write properties file ─────────────────────────────────────────────────────
// Format: KEY=VALUE (one per line, no quotes)

const content = Object.entries(props)
  .map(([k, v]) => `${k}=${v}`)
  .join('\n');

fs.writeFileSync(outputFile, content, 'utf8');
console.log(`✓ Allure environment written → ${outputFile}`);
console.log(content);
