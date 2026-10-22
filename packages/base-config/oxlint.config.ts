import { defineConfig } from 'oxlint';
import baseOxlint from './src/oxlint.ts';

export default defineConfig({
  extends: [baseOxlint],
  env: { node: true },
});
