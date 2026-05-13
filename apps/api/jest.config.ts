import type { Config } from 'jest';

/**
 * Jest configuration — 4-tier test pipeline per D-43 + Wave 0 plan.
 *
 * Projects:
 *   - unit         : pure logic, fast, no I/O
 *   - integration  : Testcontainers (Postgres 18 + PostGIS, Keycloak 26)
 *   - security     : RLS cross-tenant leak detection (D-08, BLOCKING in CI)
 *   - chaos        : sync conflict + split-brain harness (D-13, BLOCKING in CI)
 */
const config: Config = {
  preset: 'ts-jest',
  rootDir: '.',
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
      moduleNameMapper: {
        '^@gravel/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
      moduleNameMapper: {
        '^@gravel/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
    },
    {
      displayName: 'security',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      testMatch: ['<rootDir>/test/security/**/*.spec.ts'],
      moduleNameMapper: {
        '^@gravel/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
    },
    {
      displayName: 'chaos',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: '.',
      testMatch: ['<rootDir>/test/chaos/**/*.spec.ts'],
      moduleNameMapper: {
        '^@gravel/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
    },
  ],
  testTimeout: 120000,
  verbose: true,
};

export default config;
