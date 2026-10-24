import baseEslint from '@abyss/base-config/eslint';
import globals from 'globals';

export default [
  ...baseEslint({
    tsconfigRootDir: import.meta.dirname,
    ignores: ['playwright-report/**', 'test-results/**', 'blob-report/**'],
  }),
  { languageOptions: { globals: globals.node } },
  {
    files: ['tests/**/*.ts', 'src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/cms-admin/src/**', '**/web/src/**'],
              message: 'Import app code through src/app-contracts.ts.',
            },
            {
              group: ['node:child_process', 'child_process'],
              message:
                'Run SQL and shell commands through src/smoke-database.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app-contracts.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['src/smoke-database.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
