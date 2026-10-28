import { cpSync, mkdirSync } from 'node:fs';

import { defineConfig } from 'tsup';

/** Raw CSS shipped for apps that compile their own Tailwind (see README). */
const RAW_CSS_FILES = ['tokens.css', 'theme.css'] as const;

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: 'es2022',
  outDir: 'dist',
  onSuccess: () => {
    mkdirSync('dist', { recursive: true });
    for (const file of RAW_CSS_FILES) {
      cpSync(`src/styles/${file}`, `dist/${file}`);
    }
    return Promise.resolve();
  },
});
