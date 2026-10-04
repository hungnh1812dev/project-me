/// <reference types="node" />
// Vitest blanks CSS imports (even `?raw`), so the stylesheet is read from disk.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const globalsCss = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');

describe('globals.css', () => {
  it('imports the shared theme after tailwindcss', () => {
    const tailwind = globalsCss.indexOf("@import 'tailwindcss';");
    const theme = globalsCss.indexOf("@import '@repo/ui/styles/theme.css';");
    expect(tailwind).toBeGreaterThan(-1);
    expect(theme).toBeGreaterThan(tailwind);
  });

  it('scans the shared package for classes', () => {
    expect(globalsCss).toContain("@source '../../../../packages/ui/src';");
  });

  it('declares no colour tokens of its own (they live in theme.css)', () => {
    expect(globalsCss).not.toMatch(/--(background|primary|ring):/);
    expect(globalsCss).not.toMatch(/^\.dark\s*{/m);
  });

  it('self-hosts the fonts through @fontsource and loads no font CDN', () => {
    expect(globalsCss).toContain("@import '@fontsource/fira-sans/400.css'");
    expect(globalsCss).toContain("@import '@fontsource-variable/fira-code'");
    expect(globalsCss).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it('sets the Fira font families', () => {
    expect(globalsCss).toMatch(/--font-sans-family:\s*'Fira Sans'/);
    expect(globalsCss).toMatch(/--font-mono-family:\s*'Fira Code Variable'/);
  });
});
