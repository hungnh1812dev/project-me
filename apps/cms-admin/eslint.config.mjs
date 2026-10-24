import baseEslint from '@abyss/base-config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const WIRING_BAN = {
  group: ['**/app-wiring'],
  message: 'features/auth/app-wiring is for src/app/** only.',
};
const APP_BAN = {
  group: ['**/app', '**/app/**'],
  message: 'Features and lib never import from app/; app wires them.',
};
const FEATURES_BAN = {
  group: ['**/features', '**/features/**'],
  message: 'lib/ never depends on features.',
};

const importBoundary = (files, patterns, ignores = []) => ({
  files,
  ignores,
  rules: { 'no-restricted-imports': ['error', { patterns }] },
});

export default [
  ...baseEslint({ tsconfigRootDir: import.meta.dirname }),
  reactHooks.configs.flat['recommended-latest'],
  { languageOptions: { globals: globals.browser } },
  importBoundary(
    ['src/**'],
    [WIRING_BAN],
    ['src/app/**', 'src/architecture.spec.ts'],
  ),
  importBoundary(['src/features/**'], [WIRING_BAN, APP_BAN]),
  importBoundary(['src/lib/**'], [WIRING_BAN, APP_BAN, FEATURES_BAN]),
];
