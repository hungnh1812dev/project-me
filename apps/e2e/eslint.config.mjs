import baseEslint from '@abyss/base-config/eslint';
import globals from 'globals';

export default [
  ...baseEslint({
    tsconfigRootDir: import.meta.dirname,
    ignores: ['playwright-report/**', 'test-results/**', 'blob-report/**'],
  }),
  { languageOptions: { globals: globals.node } },
];
