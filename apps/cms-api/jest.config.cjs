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
      roots: ['<rootDir>/src'],
      testMatch: ['**/*.spec.ts'],
      transform,
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      rootDir: __dirname,
      roots: ['<rootDir>/test/integration'],
      testMatch: ['**/*.spec.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/integration/jest.setup.ts'],
      transform,
    },
  ],
};
