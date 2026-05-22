#!/usr/bin/env ts-node
/**
 * suggest-edge-cases.ts — AI Edge-Case Suggestion CLI
 *
 * What it does:
 * ─────────────
 * Reads an existing Playwright test file and asks Claude to identify edge cases
 * that are NOT already covered. Outputs a prioritised, opinionated list with
 * reasoning — not generic advice like "test error handling".
 *
 * The output is a markdown report saved to scripts/ai/suggestions/<filename>.md
 * You review each suggestion, mark it KEPT or REJECTED, and add your reasoning.
 * That review becomes scripts/ai/edge-case-evaluation.md — a senior SDET artefact.
 *
 * Usage:
 *   pnpm exec ts-node scripts/suggest-edge-cases.ts --file tests/api/documents-crud.spec.ts
 *   pnpm exec ts-node scripts/suggest-edge-cases.ts --file tests/security/security-headers.spec.ts --dry-run
 *   pnpm exec ts-node scripts/suggest-edge-cases.ts --file tests/api/documents-crud.spec.ts --focus security
 *
 * Options:
 *   --file <path>     Path to the test file to analyse (required)
 *   --focus <topic>   Narrow suggestions: security | performance | accessibility | concurrency | data
 *   --dry-run         Print report to stdout, don't write file
 *   --model <id>      Claude model (default: claude-haiku-4-5-20251001)
 *
 * Required env:
 *   ANTHROPIC_API_KEY
 */

import Anthropic  from '@anthropic-ai/sdk';
import * as fs    from 'fs';
import * as path  from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };
  const has  = (flag: string) => args.includes(flag);

  const filePath = get('--file');
  if (!filePath) {
    console.error([
      'Usage: pnpm exec ts-node scripts/suggest-edge-cases.ts --file <test-file>',
      '',
      'Options:',
      '  --focus <topic>   security | performance | accessibility | concurrency | data',
      '  --dry-run         Print to stdout only',
      '  --model <id>      Claude model (default: claude-haiku-4-5-20251001)',
    ].join('\n'));
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: file not found: ${resolved}`);
    process.exit(1);
  }

  return {
    filePath:  resolved,
    fileName:  path.basename(filePath, '.ts'),
    focus:     get('--focus'),
    dryRun:    has('--dry-run'),
    model:     get('--model') ?? 'claude-haiku-4-5-20251001',
  };
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(testCode: string, focus?: string): string {
  const focusInstruction = focus
    ? `Focus specifically on: **${focus}** edge cases.`
    : 'Cover all categories: security, data boundaries, concurrency, error handling, and domain-specific (e-signature/regulated-industry) edge cases.';

  return `You are a senior SDET reviewing a Playwright test file for Documenso — an open-source eIDAS-compliant e-signature platform used in regulated industries (legal, financial, healthcare).

${focusInstruction}

Your job: identify edge cases that are NOT already covered by the existing tests. Be specific and opinionated. No generic advice like "test error handling" — every suggestion must name a concrete scenario.

EXISTING TEST FILE:
\`\`\`typescript
${testCode}
\`\`\`

CONTEXT:
- Documenso handles legally binding documents under eIDAS (EU) and UK Electronic Communications Act 2000
- Documents have states: DRAFT → PENDING → COMPLETED or DECLINED
- Multi-party signing: ordered (sequential) or parallel (any order)
- Audit logs are immutable — every action is recorded and must be tamper-evident
- Signers receive email links with time-limited tokens
- Documents contain PDF fields placed at specific coordinates

OUTPUT FORMAT:
Return exactly 8 edge case suggestions. For each one, provide:

**[N]. [One-line test description]**
- **Why it matters:** One sentence on the real-world risk if this isn't tested
- **Category:** security | data-boundary | concurrency | domain | error-handling
- **Priority:** P1 (should exist) | P2 (worth adding) | P3 (nice to have)
- **Key assertion:** What you would specifically assert
- **Verdict placeholder:** KEPT / REJECTED / DEFERRED — [your reasoning here]

End with a one-paragraph summary of the biggest gap you see in the current suite.`;
}

// ── Claude call ───────────────────────────────────────────────────────────────

async function callClaude(client: Anthropic, model: string, prompt: string): Promise<string> {
  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error(`Unexpected Claude response type: ${block.type}`);
  return block.text.trim();
}

// ── Report writer ─────────────────────────────────────────────────────────────

function buildReport(
  filePath: string,
  fileName: string,
  model: string,
  focus: string | undefined,
  suggestions: string,
): string {
  const runDate = new Date().toISOString();
  return [
    `# Edge Case Suggestions — \`${path.basename(filePath)}\``,
    '',
    `> Generated by \`scripts/suggest-edge-cases.ts\`  `,
    `> Model: \`${model}\`  `,
    `> File analysed: \`${filePath}\`  `,
    `> Focus: ${focus ?? 'all categories'}  `,
    `> Generated: ${runDate}`,
    '',
    '---',
    '',
    '## Instructions for review',
    '',
    'For each suggestion below, change the **Verdict placeholder** line to one of:',
    '- `KEPT — <reason>` : added to the test suite (link the PR/commit)',
    '- `REJECTED — <reason>` : not worth adding (explain why)',
    '- `DEFERRED — <reason>` : valid but not now (explain when)',
    '',
    'Your review decisions become `scripts/ai/edge-case-evaluation.md`.',
    '',
    '---',
    '',
    suggestions,
    '',
    '---',
    '',
    '## How to act on kept suggestions',
    '',
    '```bash',
    '# Add the test manually to the relevant spec file, then run:',
    `pnpm exec playwright test ${filePath} --project=ci --reporter=list`,
    '```',
    '',
    'See `scripts/ai/ai-evaluation.md` for known AI generation patterns to watch for.',
  ].join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { filePath, fileName, focus, dryRun, model } = parseArgs();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY is not set. Add it to your .env file.');
    process.exit(1);
  }

  const testCode = fs.readFileSync(filePath, 'utf8');

  console.log(`\n🔍 Analysing: ${filePath}`);
  console.log(`   Model:   ${model}`);
  console.log(`   Focus:   ${focus ?? 'all categories'}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log('');
  console.log('⏳ Asking Claude for edge case suggestions...');

  const client    = new Anthropic({ apiKey });
  const prompt    = buildPrompt(testCode, focus);
  const suggestions = await callClaude(client, model, prompt);
  const report    = buildReport(filePath, fileName, model, focus, suggestions);

  if (dryRun) {
    console.log('\n' + '─'.repeat(60));
    console.log(report);
    return;
  }

  const outputDir  = path.resolve('scripts/ai/suggestions');
  const focusSuffix = focus ? `-${focus}` : '';
  const outputPath = path.join(outputDir, `${fileName}${focusSuffix}.md`);

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, report, 'utf8');

  console.log(`✓ Suggestions written → ${outputPath}`);
  console.log('');
  console.log('─'.repeat(60));
  console.log('Next steps:');
  console.log('  1. Open the suggestion file and review each item');
  console.log('  2. Mark each as KEPT / REJECTED / DEFERRED with your reasoning');
  console.log('  3. Add kept suggestions to the relevant spec file');
  console.log('  4. Commit the updated spec + your reviewed suggestion file');
  console.log('─'.repeat(60));
}

main().catch(err => {
  console.error('\n❌ Failed:', err.message ?? err);
  process.exit(1);
});
