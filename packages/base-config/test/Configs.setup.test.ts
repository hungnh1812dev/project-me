import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import baseEslint, { sharedIgnores } from '@abyss/base-config/eslint';
import baseOxlint from '@abyss/base-config/oxlint';
import basePrettier from '@abyss/base-config/prettier';
import { ESLint } from 'eslint';
import prettier from 'prettier';

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.join(packageRoot, '..', '..');

const sharedCoreOptions = [
  'printWidth',
  'singleQuote',
  'semi',
  'trailingComma',
  'importOrder',
] as const;

await test('prettier export is a plain options object', () => {
  assert.equal(typeof basePrettier, 'object');
  assert.equal(basePrettier.singleQuote, true);
  assert.equal(basePrettier.semi, true);
  assert.equal(basePrettier.trailingComma, 'all');
});

await test('prettier plugins are absolute paths that exist, Tailwind last', () => {
  const plugins = basePrettier.plugins as string[];
  assert.equal(plugins.length, 2);
  for (const plugin of plugins) {
    assert.ok(path.isAbsolute(plugin), `${plugin} is not absolute`);
    assert.ok(existsSync(plugin), `${plugin} does not exist`);
  }
  assert.match(plugins[0] ?? '', /prettier-plugin-sort-imports/);
  assert.match(plugins[1] ?? '', /prettier-plugin-tailwindcss/);
});

await test('prettier export formats code with the shared style', async () => {
  const output = await prettier.format('const a = {b: "c", d: [1,2]}', {
    ...basePrettier,
    parser: 'babel',
  });
  assert.equal(output, "const a = { b: 'c', d: [1, 2] };\n");
});

await test('a file in every project resolves to the shared prettier config', async () => {
  const projects = [
    '.',
    'apps/cms-api',
    'apps/cms-admin',
    'apps/web',
    'apps/e2e',
    'packages/form-commons',
    'packages/base-config',
  ];
  for (const project of projects) {
    const filepath = path.join(repoRoot, project, 'probe.ts');
    const resolved = await prettier.resolveConfig(filepath);
    assert.ok(resolved, `${project} has no prettier config`);
    assert.deepEqual(resolved.plugins, basePrettier.plugins, `${project} plugins differ`);
    for (const option of sharedCoreOptions) {
      assert.deepEqual(resolved[option], basePrettier[option], `${project} ${option} differs`);
    }
  }
});

await test('the shared config sorts imports and Tailwind classes in a tsx file', async () => {
  const output = await prettier.format(
    [
      "import { b } from './b';",
      "import { useState } from 'react';",
      '',
      "export const A = () => <div className='p-2 flex'>{b}</div>;",
      '',
    ].join('\n'),
    { ...basePrettier, parser: 'typescript' },
  );
  assert.ok(output.indexOf("from 'react'") < output.indexOf("from './b'"));
  assert.ok(output.includes('className="flex p-2"'));
});

await test('eslint export is a valid flat config with type-checked rules', async () => {
  const config = baseEslint({ tsconfigRootDir: packageRoot });
  assert.ok(Array.isArray(config));
  assert.ok(config.length > 0);

  const eslint = new ESLint({
    cwd: packageRoot,
    overrideConfigFile: true,
    overrideConfig: config,
  });
  const resolved = (await eslint.calculateConfigForFile(
    path.join(packageRoot, 'src', 'Eslint.setup.ts'),
  )) as { rules?: Record<string, unknown[]> } | undefined;
  assert.ok(resolved);
  const rules = resolved.rules ?? {};
  assert.equal(rules['@typescript-eslint/no-floating-promises']?.[0], 2);
  assert.equal(rules['@typescript-eslint/no-unused-vars']?.[0], 1);
  assert.deepEqual(rules['@typescript-eslint/no-unused-vars']?.[1], {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
  });
});

await test('eslint export adds project ignores to the shared ones', () => {
  const config = baseEslint({
    tsconfigRootDir: packageRoot,
    ignores: ['src/generated/**'],
  });
  assert.deepEqual(config[0]?.ignores, [...sharedIgnores, 'src/generated/**']);
});

await test('oxlint export has the base categories and ignores', () => {
  assert.deepEqual(baseOxlint.categories, {
    correctness: 'error',
    suspicious: 'warn',
  });
  assert.deepEqual(baseOxlint.plugins, ['typescript']);
  assert.ok(baseOxlint.ignorePatterns?.includes('dist'));
});
