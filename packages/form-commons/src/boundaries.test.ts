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

/** react-hook-form (D-1, AC-9): allowed only under `src/components/rhf/**`. */
const RHF = /^react-hook-form(\/|$)/;

/** `path` is relative to `src`. */
const isInRhf = (path: string): boolean => /^components\/rhf\//.test(path.split('\\').join('/'));

const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bexport\s*\*\s*from\s*)['"]([^'"]+)['"]/g;

const importSpecifiers = (source: string): string[] =>
  [...source.matchAll(SPECIFIER)].map((match) => match[1]);

/** `path` (relative to `src`) decides whether react-hook-form is allowed. */
const forbiddenImports = (source: string, path = ''): string[] =>
  importSpecifiers(source).filter(
    (spec) => FORBIDDEN.some((rule) => rule.test(spec)) && !(RHF.test(spec) && isInRhf(path)),
  );

const startsWithUseClient = (source: string): boolean =>
  /^\s*(['"])use client\1;?/.test(source.replace(/^\uFEFF/, ''));

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });

/** The package's old name (AC-B6): no alias or re-export of it may remain. */
const OLD_NAME = /^@repo\/ui(\/|$)/;

const oldNameImports = (source: string): string[] =>
  importSpecifiers(source).filter((spec) => OLD_NAME.test(spec));

const sourceFiles = listFiles(SRC).filter((file) => /\.(ts|tsx)$/.test(file) && file !== SELF);
const rel = (file: string): string => relative(SRC, file);

/** Storybook packages (AC-10): only `.storybook/**` and `src/stories/**` may import them. */
const STORYBOOK = /^(storybook|@storybook\/[^/]+)(\/|$)/;

const storybookImports = (source: string): string[] =>
  importSpecifiers(source).filter((spec) => STORYBOOK.test(spec));

const posix = (path: string): string => path.split('\\').join('/');

/** `path` is relative to `src`. */
const isInStories = (path: string): boolean => posix(path).startsWith('stories/');

const isStoryFile = (path: string): boolean => /\.stories\.[^/]+$/.test(posix(path));

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

  it('allows react-hook-form under components/rhf/ only', () => {
    const source = [
      "import { useController } from 'react-hook-form';",
      "import { cn } from '@/utils/cn';",
    ].join('\n');

    expect(forbiddenImports(source, 'components/rhf/RHFField.tsx')).toEqual(['@/utils/cn']);
    expect(forbiddenImports(source, 'components/rhf/RHFField.test.tsx')).toEqual(['@/utils/cn']);
    expect(forbiddenImports(source, 'components/forms/Field.tsx')).toEqual([
      'react-hook-form',
      '@/utils/cn',
    ]);
    expect(forbiddenImports(source, 'components/rhfx/A.tsx')).toEqual([
      'react-hook-form',
      '@/utils/cn',
    ]);
    expect(forbiddenImports(source, 'stories/components/RHFField.stories.tsx')).toEqual([
      'react-hook-form',
      '@/utils/cn',
    ]);
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
      expect(forbiddenImports(readFileSync(file, 'utf8'), rel(file))).toEqual([]);
    },
  );
});

describe('storybookImports', () => {
  it('flags the storybook package and any @storybook/* package', () => {
    const source = [
      "import type { Meta, StoryObj } from '@storybook/react-vite';",
      "import { fn } from 'storybook/test';",
      "import 'storybook';",
      "const a11y = import('@storybook/addon-a11y');",
    ].join('\n');

    expect(storybookImports(source)).toEqual([
      '@storybook/react-vite',
      'storybook/test',
      'storybook',
      '@storybook/addon-a11y',
    ]);
  });

  it('allows look-alike packages and relative story paths', () => {
    const source = [
      "import x from 'storybook-addon-x';",
      "import { y } from '@storybooks/y';",
      "import { ButtonSection } from '../stories/sections/ButtonSection';",
    ].join('\n');

    expect(storybookImports(source)).toEqual([]);
  });
});

describe('isInStories / isStoryFile', () => {
  it('recognises files under src/stories only', () => {
    expect(isInStories('stories/UiKit.stories.tsx')).toBe(true);
    expect(isInStories('stories/sections/Section.tsx')).toBe(true);
    expect(isInStories('components/ui/stories/x.tsx')).toBe(false);
    expect(isInStories('storiesX/a.tsx')).toBe(false);
  });

  it('recognises *.stories.* files by name', () => {
    expect(isStoryFile('components/ui/button.stories.tsx')).toBe(true);
    expect(isStoryFile('stories/Intro.stories.mdx')).toBe(true);
    expect(isStoryFile('components/ui/button.tsx')).toBe(false);
    expect(isStoryFile('stories/sections/Section.tsx')).toBe(false);
  });
});

describe('stories boundaries (AC-18, AC-10)', () => {
  const allFiles = listFiles(SRC).map(rel);

  it('the scanned source set includes src/stories files', () => {
    expect(sourceFiles.map(rel)).toContain(join('stories', 'UiKit.stories.tsx'));
    expect(sourceFiles.map(rel)).toContain(join('stories', 'sections', 'Section.tsx'));
  });

  it('no *.stories.* file lives outside src/stories', () => {
    expect(allFiles.filter((file) => isStoryFile(file) && !isInStories(file))).toEqual([]);
  });

  it('no file outside src/stories imports storybook or @storybook/*', () => {
    const offenders = sourceFiles
      .filter((file) => !isInStories(rel(file)))
      .filter((file) => storybookImports(readFileSync(file, 'utf8')).length > 0)
      .map(rel);

    expect(offenders).toEqual([]);
  });
});

describe("'use client' directive (AC-6)", () => {
  const clientModules = sourceFiles.filter((file) => {
    const path = rel(file).split('\\').join('/');
    return /^components\/(ui|forms|rhf)\/.*\.tsx$/.test(path) && !path.endsWith('.test.tsx');
  });

  it('scans components/rhf/', () => {
    expect(clientModules.map(rel)).toContain(join('components', 'rhf', 'RHFField.tsx'));
  });

  it('every .tsx module in components/ui/, components/forms/ and components/rhf/ starts with the directive', () => {
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

  it.each(PRIMITIVES)('components/ui/%s.tsx is in the package', (name) => {
    expect(existsSync(join(SRC, 'components', 'ui', `${name}.tsx`))).toBe(true);
  });

  it.each([
    'components/ui/variants.ts',
    'hooks/use-mobile.ts',
    'hooks/use-sidebar.ts',
    'lib/cn.ts',
  ])('%s is in the package', (path) => {
    expect(existsSync(join(SRC, path))).toBe(true);
  });
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

  it.each(FORM)('components/forms/%s.tsx is in the package', (name) => {
    expect(existsSync(join(SRC, 'components', 'forms', `${name}.tsx`))).toBe(true);
  });

  it('the old form/ folder is gone', () => {
    expect(existsSync(join(SRC, 'form'))).toBe(false);
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
    const outside = Object.values(config.aliases).filter(
      (alias) => !alias.startsWith('@repo/form-commons/'),
    );

    expect(outside).toEqual([]);
  });

  it('shadcn adds primitives to components/ui (AC-B5)', () => {
    const config = JSON.parse(readFileSync(CONFIG, 'utf8')) as { aliases: Record<string, string> };

    expect(config.aliases).toEqual({
      components: '@repo/form-commons/components',
      ui: '@repo/form-commons/components/ui',
      utils: '@repo/form-commons/lib/cn',
      lib: '@repo/form-commons/lib',
      hooks: '@repo/form-commons/hooks',
    });
  });

  it('tsconfig maps the package alias to src so the shadcn CLI resolves every alias', () => {
    const tsconfig = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'tsconfig.json'), 'utf8')) as {
      compilerOptions: { paths?: Record<string, string[]> };
    };

    expect(tsconfig.compilerOptions.paths).toEqual({ '@repo/form-commons/*': ['./src/*'] });
  });

  it('package exports match the components/ui, components/forms and components/rhf layout (AC-B1)', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      exports: Record<string, string>;
    };

    expect(pkg.exports).toEqual({
      './components/ui/variants': './src/components/ui/variants.ts',
      './components/ui/*': './src/components/ui/*.tsx',
      './components/forms/*': './src/components/forms/*.tsx',
      './components/rhf/*': './src/components/rhf/*.tsx',
      './hooks/*': './src/hooks/*.ts',
      './lib/*': './src/lib/*.ts',
      './styles/theme.css': './src/styles/theme.css',
      './styles/tokens': './src/styles/tokens.ts',
    });
  });

  it('the Tailwind css entry is the package theme', () => {
    const config = JSON.parse(readFileSync(CONFIG, 'utf8')) as { tailwind: { css: string } };

    expect(existsSync(join(PACKAGE_ROOT, config.tailwind.css))).toBe(true);
  });
});

describe('oldNameImports', () => {
  // Built at runtime so the repo-wide stale-refs grep (AC-B14) stays empty.
  const OLD = ['@repo', 'ui'].join('/');

  it('flags the old package name and its subpaths', () => {
    const source = [
      `import { Button } from '${OLD}/components/button';`,
      `import '${OLD}/styles/theme.css';`,
      `export * from '${OLD}';`,
    ].join('\n');

    expect(oldNameImports(source)).toEqual([
      `${OLD}/components/button`,
      `${OLD}/styles/theme.css`,
      OLD,
    ]);
  });

  it('allows the new name and look-alike packages', () => {
    const source = [
      "import { Button } from '@repo/form-commons/components/button';",
      `import x from '${OLD}-kit';`,
    ].join('\n');

    expect(oldNameImports(source)).toEqual([]);
  });
});

describe('no old package name imports (AC-B6)', () => {
  const ADMIN_SRC = join(SRC, '..', '..', '..', 'apps', 'cms-admin', 'src');
  const files = [
    ...sourceFiles,
    ...listFiles(ADMIN_SRC).filter((file) => /\.(ts|tsx|css)$/.test(file)),
  ];

  it('has files to scan in the package and in cms-admin', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(files.length).toBeGreaterThan(sourceFiles.length);
  });

  it.each(files.map((file) => [relative(join(SRC, '..', '..', '..'), file), file]))(
    '%s does not import the old package name',
    (_name, file) => {
      expect(oldNameImports(readFileSync(file, 'utf8'))).toEqual([]);
    },
  );
});

/** Subpaths the package exports (AC-B8, AC-B10); anything else under the new name is stale. */
const VALID_SUBPATH =
  /^@repo\/form-commons\/(components\/(ui|forms|rhf)\/[^/]+|hooks\/[^/]+|lib\/[^/]+|styles\/(theme\.css|tokens))$/;

const staleSubpathImports = (source: string): string[] =>
  importSpecifiers(source).filter(
    (spec) => spec.startsWith('@repo/form-commons') && !VALID_SUBPATH.test(spec),
  );

describe('staleSubpathImports', () => {
  it('flags the pre-split components/ and form/ subpaths', () => {
    const source = [
      "import { Button } from '@repo/form-commons/components/button';",
      "import { buttonVariants } from '@repo/form-commons/components/variants';",
      "import { Field } from '@repo/form-commons/form/Field';",
      "import { RHFField } from '@repo/form-commons/components/rhf/nested/RHFField';",
    ].join('\n');

    expect(staleSubpathImports(source)).toEqual([
      '@repo/form-commons/components/button',
      '@repo/form-commons/components/variants',
      '@repo/form-commons/form/Field',
      '@repo/form-commons/components/rhf/nested/RHFField',
    ]);
  });

  it('allows the exported subpaths', () => {
    const source = [
      "import { Button } from '@repo/form-commons/components/ui/button';",
      "import { buttonVariants } from '@repo/form-commons/components/ui/variants';",
      "import { Field } from '@repo/form-commons/components/forms/Field';",
      "import { RHFField } from '@repo/form-commons/components/rhf/RHFField';",
      "import { useIsMobile } from '@repo/form-commons/hooks/use-mobile';",
      "import { cn } from '@repo/form-commons/lib/cn';",
      "import { TOKENS } from '@repo/form-commons/styles/tokens';",
      "@import '@repo/form-commons/styles/theme.css';",
    ].join('\n');

    expect(staleSubpathImports(source)).toEqual([]);
  });
});

describe('consumers use the components/ui and components/forms subpaths (AC-B8, AC-B10)', () => {
  const ROOT = join(SRC, '..', '..', '..');
  const ADMIN = join(ROOT, 'apps', 'cms-admin');
  const files = [
    ...listFiles(join(ADMIN, 'src')),
    ...listFiles(join(ADMIN, 'e2e')),
    join(ROOT, 'apps', 'frontend', 'src', 'ui-compile-check.ts'),
  ].filter((file) => /\.(ts|tsx|css)$/.test(file));

  it.each(files.map((file) => [relative(ROOT, file), file]))(
    '%s imports only exported subpaths',
    (_name, file) => {
      expect(staleSubpathImports(readFileSync(file, 'utf8'))).toEqual([]);
    },
  );
});
