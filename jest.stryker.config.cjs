/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/unit'],
  testMatch: ['**/*.spec.ts'],
  // Redirect vitest imports to jest-compatible shim
  moduleNameMapper: {
    '^vitest$': '<rootDir>/jest-vitest-compat.cjs',
  },
  setupFilesAfterFramework: undefined,
  setupFilesAfterEnv: ['<rootDir>/jest-vitest-compat.cjs'],
  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        types: ['jest', 'node'],
      },
    },
  },
};

module.exports = config;
