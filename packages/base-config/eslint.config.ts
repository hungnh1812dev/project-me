import globals from 'globals';
import baseEslint from './src/eslint.ts';

export default [
  ...baseEslint({ tsconfigRootDir: import.meta.dirname }),
  { languageOptions: { globals: globals.node } },
];
