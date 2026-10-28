import baseOxlint from '@abyss/base-config/oxlint';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [baseOxlint],
  plugins: ['typescript', 'jest', 'node'],
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['src/generated'],
  rules: {
    'typescript/no-extraneous-class': [
      'warn',
      {
        allowWithDecorator: true,
        allowStaticOnly: true,
      },
    ],
  },
});
