import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/pact/**/*.spec.ts'],
  testTimeout: 30000,
  // @pact-foundation/pact v16 introduced ESM-only transitive deps (https-proxy-agent@9)
  // which cannot be loaded by Jest in CommonJS mode. Downgraded to v15 in package.json
  // (see pnpm install step). v15 ships pure CommonJS — no transformIgnorePatterns needed.
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          types: ['jest', 'node'],
        },
      },
    ],
  },
};

export default config;
