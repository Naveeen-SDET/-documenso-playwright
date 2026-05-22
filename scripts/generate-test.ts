#!/usr/bin/env ts-node
/**
 * generate-test.ts — AI Test Generation CLI
 *
 * What it does:
 * ─────────────
 * Given a plain-English description of a Documenso API endpoint, this script
 * calls Claude (claude-haiku-4-5) to generate:
 *   1. A Zod v4 schema for the response body
 *   2. A Playwright API test skeleton covering happy path, auth guards, and edge cases
 *
 * The output is written to tests/api/generated/<endpoint-name>.spec.ts and
 * schemas/generated/<endpoint-name>.schema.ts — ready for review and editing.
 *
 * Why this exists:
 * ────────────────
 * AI generation cuts the time to a working test skeleton from ~30 minutes to ~2
 * minutes. The SDET's job then becomes critical review, not blank-page authoring.
 * See scripts/ai/ai-evaluation.md for an honest assessment of what the AI gets
 * right and what it gets wrong.
 *
 * Usage:
 *   pnpm exec ts-node scripts/generate-test.ts --endpoint "GET /api/v1/documents"
 *   pnpm exec ts-node scripts/generate-test.ts --spec specs/documents-list.txt
 *   pnpm exec ts-node scripts/generate-test.ts --endpoint "POST /api/v1/documents" --dry-run
 *
 * Required env:
 *   ANTHROPIC_API_KEY — your Anthropic API key (add to .env)
 *
 * Options:
 *   --endpoint "<description>"  Inline endpoint description
 *   --spec <file>               Path to a text file with the endpoint spec
 *   --dry-run                   Print generated code to stdout, don't write files
 *   --model <model>             Claude model to use (default: claude-haiku-4-5-20251001)
 *   --skip-test                 Only generate the schema, skip the test skeleton
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs    from 'fs';
import * as path  from 'path';
import * as dotenv from 'dotenv';
import { buildSchemaPrompt, buildTestPrompt } from './ai/prompts';

dotenv.config();

// ── CLI argument parsing ──────────────────────────────────────────────────────

function parseArgs(): {
  endpointSpec: string;
  dryRun: boolean;
  model: string;
  skipTest: boolean;
  outputName: string;
} {
  const args = process.argv.slice(2);
  const get  = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  const has = (flag: string) => args.includes(flag);

  let endpointSpec = get('--endpoint') ?? '';

  const specFile = get('--spec');
  if (specFile) {
    const resolved = path.resolve(specFile);
    if (!fs.existsSync(resolved)) {
      console.error(`Error: spec file not found: ${resolved}`);
      process.exit(1);
    }
    endpointSpec = fs.readFileSync(resolved, 'utf8').trim();
  }

  if (!endpointSpec) {
    console.error([
      'Usage:',
      '  pnpm exec ts-node scripts/generate-test.ts --endpoint "GET /api/v1/documents"',
      '  pnpm exec ts-node scripts/generate-test.ts --spec specs/my-endpoint.txt',
      '',
      'Options:',
      '  --dry-run      Print to stdout only, do not write files',
      '  --skip-test    Generate schema only',
      '  --model <id>   Claude model (default: claude-haiku-4-5-20251001)',
    ].join('\n'));
    process.exit(1);
  }

  // Derive a safe filename from the endpoint description
  // "GET /api/v1/documents/:id" → "documents-by-id"
  const outputName = (get('--output') ?? endpointSpec)
    .toLowerCase()
    .replace(/get|post|put|patch|delete/gi, '')
    .replace(/\/api\/v\d+\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'generated';

  return {
    endpointSpec,
    dryRun:    has('--dry-run'),
    skipTest:  has('--skip-test'),
    model:     get('--model') ?? 'claude-haiku-4-5-20251001',
    outputName,
  };
}

// ── Claude API call ───────────────────────────────────────────────────────────

async function callClaude(client: Anthropic, model: string, prompt: string): Promise<string> {
  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== 'text') {
    throw new Error(`Unexpected response type from Claude: ${block.type}`);
  }

  // Strip markdown code fences if Claude added them despite instructions
  return block.text
    .replace(/^```(?:typescript|ts)?\n/m, '')
    .replace(/\n```\s*$/m, '')
    .trim();
}

// ── File writer ───────────────────────────────────────────────────────────────

function writeOutput(filePath: string, content: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`// Would write to: ${filePath}`);
    console.log('─'.repeat(60));
    console.log(content);
    return;
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓ Written → ${filePath}`);
}

// ── Header comment ────────────────────────────────────────────────────────────

function generatedHeader(endpointSpec: string, model: string): string {
  return [
    '/**',
    ' * ⚠️  AI-GENERATED FILE — REVIEW BEFORE COMMITTING',
    ' *',
    ` * Generated by: scripts/generate-test.ts`,
    ` * Model:        ${model}`,
    ` * Endpoint:     ${endpointSpec.split('\n')[0]}`,
    ` * Generated at: ${new Date().toISOString()}`,
    ' *',
    ' * What to review:',
    ' *   1. Schema field types — AI infers from names, may be wrong',
    ' *   2. Optional vs required fields — AI guesses; check the real API response',
    ' *   3. Enum values — AI may miss valid states (e.g. DECLINED, EXPIRED)',
    ' *   4. Error message assertions — exact strings may differ from the real app',
    ' *   5. Remove or adjust any test that uses hardcoded IDs',
    ' *',
    ' * See scripts/ai/ai-evaluation.md for known AI generation patterns to watch for.',
    ' */',
    '',
  ].join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { endpointSpec, dryRun, model, skipTest, outputName } = parseArgs();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY is not set. Add it to your .env file.');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  console.log(`\n🤖 Generating test assets for: ${endpointSpec.split('\n')[0]}`);
  console.log(`   Model: ${model}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log('');

  // ── Step 1: Generate Zod schema ────────────────────────────────────────────

  console.log('⏳ Step 1/2: Generating Zod schema...');
  const schemaPrompt = buildSchemaPrompt(endpointSpec);
  const schemaCode   = await callClaude(client, model, schemaPrompt);

  const schemaHeader  = generatedHeader(endpointSpec, model);
  const schemaContent = `${schemaHeader}import { z } from 'zod';\n\n${schemaCode}\n`;
  const schemaPath    = path.resolve(`schemas/generated/${outputName}.schema.ts`);

  writeOutput(schemaPath, schemaContent, dryRun);
  console.log('✓ Schema generated\n');

  if (skipTest) {
    console.log('--skip-test flag set — skipping test generation.');
    return;
  }

  // ── Step 2: Generate test skeleton ────────────────────────────────────────

  console.log('⏳ Step 2/2: Generating test skeleton...');
  const testPrompt   = buildTestPrompt(endpointSpec, schemaCode);
  const testCode     = await callClaude(client, model, testPrompt);

  const testHeader   = generatedHeader(endpointSpec, model);
  const testContent  = `${testHeader}${testCode}\n`;
  const testPath     = path.resolve(`tests/api/generated/${outputName}.spec.ts`);

  writeOutput(testPath, testContent, dryRun);
  console.log('✓ Test skeleton generated\n');

  // ── Summary ────────────────────────────────────────────────────────────────

  if (!dryRun) {
    console.log('─'.repeat(60));
    console.log('✅ Generation complete. Next steps:');
    console.log(`   1. Review schema:  ${schemaPath}`);
    console.log(`   2. Review test:    ${testPath}`);
    console.log('   3. Run the test against Docker to verify it works');
    console.log('   4. Check ai-evaluation.md for known issues to look for');
    console.log('   5. Remove the ⚠️  header comment once reviewed');
    console.log('─'.repeat(60));
  }
}

main().catch(err => {
  console.error('\n❌ Generation failed:', err.message ?? err);
  process.exit(1);
});
