import globals from 'globals';
import baseEslint from './src/Eslint.setup.ts';

export default [
  ...baseEslint({ tsconfigRootDir: import.meta.dirname }),
  { languageOptions: { globals: globals.node } },
];
