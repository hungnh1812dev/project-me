import baseOxlint from '@abyss/base-config/oxlint';
import { defineConfig } from 'oxlint';

export default defineConfig({
  extends: [baseOxlint],
  plugins: ['typescript'],
  env: { node: true },
  ignorePatterns: ['playwright-report', 'test-results', 'blob-report'],
});
