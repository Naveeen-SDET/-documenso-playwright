/** @type {import('@stryker-mutator/api/config').Config} */
const config = {
  plugins: [
    '@stryker-mutator/jest-runner',
  ],
  testRunner: 'jest',
  jest: {
    projectType: 'custom',
    configFile: './jest.stryker.config.cjs',
    enableFindRelatedTests: true,
  },

  // Files to mutate — source only, not tests
  mutate: [
    'utils/data-factory.ts',
    'api/documents.api.ts',
    '!**/*.spec.ts',
  ],

  // No TypeScript checker — vitest runner handles type errors at runtime

  // Reporters
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },

  // Thresholds
  thresholds: {
    high: 80,
    low: 50,
    break: null,   // Don't fail CI — score is documented with known gaps explained
  },

  // Performance
  timeoutMS: 15000,
  timeoutFactor: 1.5,
  concurrency: 2,

  // Ignore low-value mutation types
  mutator: {
    excludedMutations: ['StringLiteral'],
  },
};

export default config;
