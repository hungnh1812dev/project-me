import baseOxlint from '@abyss/base-config/oxlint';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [baseOxlint],
  plugins: ['typescript', 'react', 'jsx-a11y', 'vitest'],
  env: { browser: true },
  rules: {
    'react/react-in-jsx-scope': 'off',
  },
  ignorePatterns: ['.next'],
});
