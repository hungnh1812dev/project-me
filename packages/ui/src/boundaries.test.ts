import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = import.meta.dirname;
const SELF = import.meta.filename;

/** Import specifiers the package must never use (AC-5): app aliases, app paths and app-only libraries. */
const FORBIDDEN: readonly RegExp[] = [
  /^@\//,
  /(^|\/)apps\//,
  /^react-router/,
  /^axios(\/|$)/,
  /^@reduxjs\//,
  /^react-redux(\/|$)/,
  /^@tanstack\//,
  /^react-hook-form(\/|$)/,
];

const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bexport\s*\*\s*from\s*)['"]([^'"]+)['"]/g;

const importSpecifiers = (source: string): string[] =>
  [...source.matchAll(SPECIFIER)].map((match) => match[1]);

const forbiddenImports = (source: string): string[] =>
  importSpecifiers(source).filter((spec) => FORBIDDEN.some((rule) => rule.test(spec)));

const startsWithUseClient = (source: string): boolean =>
  /^\s*(['"])use client\1;?/.test(source.replace(/^\uFEFF/, ''));

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });

const sourceFiles = listFiles(SRC).filter((file) => /\.(ts|tsx)$/.test(file) && file !== SELF);
const rel = (file: string): string => relative(SRC, file);

describe('forbiddenImports', () => {
  it('flags the app alias, app paths and app-only libraries', () => {
    const source = [
      "import { cn } from '@/utils/cn';",
      "import x from '../../../apps/cms-admin/src/x';",
      "import { Link } from 'react-router-dom';",
      "import axios from 'axios';",
      "import { createSlice } from '@reduxjs/toolkit';",
      "import { useSelector } from 'react-redux';",
      "import { useQuery } from '@tanstack/react-query';",
      "import { useForm } from 'react-hook-form';",
      "const lazy = import('@/pages/Lazy');",
      "export * from 'react-router';",
    ].join('\n');

    expect(forbiddenImports(source)).toEqual([
      '@/utils/cn',
      '../../../apps/cms-admin/src/x',
      'react-router-dom',
      'axios',
      '@reduxjs/toolkit',
      'react-redux',
      '@tanstack/react-query',
      'react-hook-form',
      '@/pages/Lazy',
      'react-router',
    ]);
  });

  it('allows relative imports and the package dependencies', () => {
    const source = [
      "import { clsx } from 'clsx';",
      "import { twMerge } from 'tailwind-merge';",
      "import { cn } from '../lib/cn';",
      "import type { ReactNode } from 'react';",
      "import '@testing-library/jest-dom/vitest';",
    ].join('\n');

    expect(forbiddenImports(source)).toEqual([]);
  });
});

describe('startsWithUseClient', () => {
  it('accepts a module whose first statement is the directive', () => {
    expect(startsWithUseClient("'use client';\n\nexport const A = 1;")).toBe(true);
    expect(startsWithUseClient('"use client"\nexport const A = 1;')).toBe(true);
  });

  it('rejects a module without the directive, or with it after other code', () => {
    expect(startsWithUseClient('export const A = 1;')).toBe(false);
    expect(startsWithUseClient("import x from 'y';\n'use client';")).toBe(false);
  });
});

describe('package boundaries (AC-5)', () => {
  it.each(sourceFiles.map((file) => [rel(file), file]))(
    '%s imports nothing from the apps or app-only libraries',
    (_name, file) => {
      expect(forbiddenImports(readFileSync(file, 'utf8'))).toEqual([]);
    },
  );
});

describe("'use client' directive (AC-6)", () => {
  const clientModules = sourceFiles.filter((file) => {
    const path = rel(file).split('\\').join('/');
    return /^(components|form)\/.*\.tsx$/.test(path) && !path.endsWith('.test.tsx');
  });

  it('every .tsx module in components/ and form/ starts with the directive', () => {
    const missing = clientModules
      .filter((file) => !startsWithUseClient(readFileSync(file, 'utf8')))
      .map(rel);

    expect(missing).toEqual([]);
  });
});

describe('primitives (AC-2)', () => {
  const PRIMITIVES = [
    'alert',
    'alert-dialog',
    'badge',
    'breadcrumb',
    'button',
    'calendar',
    'card',
    'checkbox',
    'dialog',
    'dropdown-menu',
    'input',
    'label',
    'popover',
    'select',
    'separator',
    'sheet',
    'sidebar',
    'skeleton',
    'switch',
    'table',
    'textarea',
    'tooltip',
  ] as const;

  it.each(PRIMITIVES)('components/%s.tsx is in the package', (name) => {
    expect(existsSync(join(SRC, 'components', `${name}.tsx`))).toBe(true);
  });

  it.each(['components/variants.ts', 'hooks/use-mobile.ts', 'hooks/use-sidebar.ts', 'lib/cn.ts'])(
    '%s is in the package',
    (path) => {
      expect(existsSync(join(SRC, path))).toBe(true);
    },
  );
});

describe('generic form components (AC-3)', () => {
  const FORM = [
    'Field',
    'PasswordInput',
    'JsonInput',
    'DatePicker',
    'ConfirmDialog',
    'UnsavedChangesDialog',
    'SecretReveal',
    'GatedButton',
    'GatedMenuItem',
    'FileDropzone',
  ] as const;

  it.each(FORM)('form/%s.tsx is in the package', (name) => {
    expect(existsSync(join(SRC, 'form', `${name}.tsx`))).toBe(true);
  });

  it.each(['lib/json.ts', 'lib/decision.ts'])('%s is in the package', (path) => {
    expect(existsSync(join(SRC, path))).toBe(true);
  });
});

describe('shadcn CLI config (AC-8)', () => {
  const PACKAGE_ROOT = join(SRC, '..');
  const CONFIG = join(PACKAGE_ROOT, 'components.json');

  it('components.json lives in the package', () => {
    expect(existsSync(CONFIG)).toBe(true);
  });

  it('components.json is no longer in cms-admin', () => {
    expect(existsSync(join(PACKAGE_ROOT, '..', '..', 'apps', 'cms-admin', 'components.json'))).toBe(
      false,
    );
  });

  it('every alias points inside the package', () => {
    const config = JSON.parse(readFileSync(CONFIG, 'utf8')) as { aliases: Record<string, string> };
    const outside = Object.values(config.aliases).filter((alias) => !alias.startsWith('@repo/ui/'));

    expect(outside).toEqual([]);
  });

  it('the Tailwind css entry is the package theme', () => {
    const config = JSON.parse(readFileSync(CONFIG, 'utf8')) as { tailwind: { css: string } };

    expect(existsSync(join(PACKAGE_ROOT, config.tailwind.css))).toBe(true);
  });
});
