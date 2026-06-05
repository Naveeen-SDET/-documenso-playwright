import type { Config } from '@stryker-mutator/api/config';

/**
 * Stryker mutation testing config (Day 55)
 *
 * Targets: utils/data-factory.ts and api/documents.api.ts
 * Runner: Vitest (vitest@1.6.0 — locked on Windows, do not upgrade)
 *
 * Run:  pnpm run mutation
 * Report: reports/mutation/index.html
 */
const config: Config = {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },

  // Files to mutate — source only, not tests
  mutate: [
    'utils/data-factory.ts',
    'api/documents.api.ts',
    '!**/*.spec.ts',
    '!**/node_modules/**',
  ],

  // TypeScript type checking on mutants — catches type errors before running tests
  checkers: ['typescript'],
  typescriptChecker: {
    prioritizePerformanceOverAccuracy: true,
  },

  // Reporters
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },

  // Thresholds — fail if mutation score drops below these
  thresholds: {
    high: 80,
    low: 70,
    break: 60,   // CI fails if score drops below 60
  },

  // Performance
  timeoutMS: 15000,
  timeoutFactor: 1.5,
  concurrency: 2,

  // Ignore these mutation types — they generate noise without value
  ignoreMutations: [
    'StringLiteral',   // changing string literals rarely reveals missing tests
  ],
};

export default config;
