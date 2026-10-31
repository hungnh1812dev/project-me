import { cpSync, mkdirSync, readdirSync } from 'node:fs';

import { defineConfig } from 'tsup';

/** Raw CSS shipped for apps that compile their own Tailwind (see README). */
const RAW_CSS_FILES = ['tokens.css', 'theme.css'] as const;

const FORMS_DIR = 'src/components/forms';
const UI_DIR = 'src/components/ui';

/** `Button.tsx` → `button`; files with a kind word (`Control.constants.ts`) are internal. */
const UI_COMPONENT_FILE = /^([A-Z]\w*)\.tsx$/;

function toKebabCase(pascalName: string): string {
  return pascalName.replace(/(?<!^)([A-Z])/g, '-$1').toLowerCase();
}

/**
 * One entry per component, published as `@abyss/form-commons/<name>` so apps
 * can import (or dynamically import) a single component without the barrel.
 */
function componentEntries(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const dirent of readdirSync(FORMS_DIR, { withFileTypes: true })) {
    if (dirent.isDirectory()) {
      entries[`${dirent.name}/index`] = `${FORMS_DIR}/${dirent.name}/index.ts`;
    }
  }
  for (const file of readdirSync(UI_DIR)) {
    const match = UI_COMPONENT_FILE.exec(file);
    if (match?.[1]) {
      entries[`${toKebabCase(match[1])}/index`] = `${UI_DIR}/${file}`;
    }
  }
  return entries;
}

/**
 * esbuild groups modules by the set of entries that use them. Without its own
 * entry, the CSP nonce constant (barrel + richtext) shares a chunk with the
 * Tiptap editor, so importing it from the barrel loads Tiptap eagerly.
 */
const CONSTANT_ENTRIES = { 'security/index': 'src/constants/Security.constants.ts' };

export default defineConfig({
  entry: { index: 'src/index.ts', ...componentEntries(), ...CONSTANT_ENTRIES },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Shared code (Field wiring, Button, ...) goes into common chunks instead of
  // being copied into every component entry.
  splitting: true,
  esbuildOptions(options) {
    options.chunkNames = 'chunks/[name]-[hash]';
  },
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
