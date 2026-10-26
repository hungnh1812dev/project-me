import globals from 'globals';
import baseEslint from './src/Eslint.setup.ts';

export default [
  ...baseEslint({ tsconfigRootDir: import.meta.dirname, fileNames: {} }),
  { languageOptions: { globals: globals.node } },
];
