import { defineConfig } from 'oxlint';

/**
 * Oxlint rules every project shares. A project's `oxlint.config.ts` lists this
 * in `extends` and adds its own plugins, env, ignores and rules.
 *
 * @example
 *   export default defineConfig({
 *     extends: [baseOxlint],
 *     plugins: ['typescript', 'react'],
 *   });
 */
const config = defineConfig({
  plugins: ['typescript'],
  categories: {
    correctness: 'error',
    suspicious: 'warn',
  },
  rules: {
    'no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
  },
  ignorePatterns: ['dist', 'coverage', 'node_modules'],
});

export default config;
