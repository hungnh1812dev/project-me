import baseEslint from '@abyss/base-config/eslint';
import globals from 'globals';

export default [
  ...baseEslint({
    tsconfigRootDir: import.meta.dirname,
    ignores: ['src/generated/**'],
  }),
  { languageOptions: { globals: globals.node } },
];
