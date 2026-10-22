import baseEslint from '@abyss/base-config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  ...baseEslint({ tsconfigRootDir: import.meta.dirname }),
  reactHooks.configs.flat['recommended-latest'],
  { languageOptions: { globals: globals.browser } },
];
