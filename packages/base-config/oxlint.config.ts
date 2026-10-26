import { defineConfig } from 'oxlint';
import baseOxlint from './src/Oxlint.setup.ts';

export default defineConfig({
  extends: [baseOxlint],
  env: { node: true },
});
