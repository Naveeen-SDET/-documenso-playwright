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
  // Pattern must NOT include '.pnpm' — Jest resolves symlinks and sees
  // the canonical /node_modules/<pkg>/ path, not the pnpm store path.
  transformIgnorePatterns: [`/node_modules/(?!(${ESM_PACKAGES})/)`],
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
