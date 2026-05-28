import type { Config } from 'jest';

// @pact-foundation/pact v16 pulls in ESM-only transitive dependencies
// (https-proxy-agent@9, agent-base@7, etc.). Jest's default transformIgnorePatterns
// skips all node_modules, causing "Cannot use import statement outside a module".
// This pattern tells Jest to transform those ESM packages through ts-jest.
const ESM_PACKAGES = [
  'https-proxy-agent',
  'agent-base',
  'get-uri',
  'pac-proxy-agent',
  'pac-resolver',
  'socks-proxy-agent',
  'ip-regex',
  'netmask',
  'degenerator',
  'socks',
].join('|');

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/pact/**/*.spec.ts'],
  testTimeout: 30000,
  // Transform ESM-only packages from pact's dependency tree.
  //
  // pnpm stores packages at:
  //   node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/dist/index.js
  //                                  ^^^ inner node_modules
  //
  // A naive /node_modules/(?!(pkg))/ pattern matches at the OUTER node_modules
  // (seeing ".pnpm/" which is not in the exclude list) and ignores the file
  // before the inner check can run.
  //
  // Fix: target the INNER node_modules inside the pnpm store explicitly:
  //   /node_modules/.pnpm/[^/]+/node_modules/(?!(pkg)/)
  // This only matches the second node_modules segment, so the negative
  // lookahead correctly sees the actual package name.
  transformIgnorePatterns: [
    `/node_modules/.pnpm/[^/]+/node_modules/(?!(${ESM_PACKAGES})/)`,
  ],
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
