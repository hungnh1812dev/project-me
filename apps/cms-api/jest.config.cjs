// @ts-check
const transform = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
};

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      rootDir: __dirname,
      roots: ['<rootDir>/src', '<rootDir>/test/architecture'],
      testMatch: ['**/*.spec.ts'],
      transform,
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      rootDir: __dirname,
      roots: ['<rootDir>/test/integration'],
      testMatch: ['**/*.spec.ts'],
      globalSetup: '<rootDir>/test/integration/SharedPostgresStart.setup.ts',
      globalTeardown: '<rootDir>/test/integration/SharedPostgresStop.setup.ts',
      setupFilesAfterEnv: ['<rootDir>/test/integration/Jest.setup.ts'],
      transform,
    },
  ],
};
