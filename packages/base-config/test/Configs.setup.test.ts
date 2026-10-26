import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import prettier from 'prettier';
import baseEslint, { sharedIgnores } from '@abyss/base-config/eslint';
import baseOxlint from '@abyss/base-config/oxlint';
import basePrettier from '@abyss/base-config/prettier';

const packageRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repoRoot = path.join(packageRoot, '..', '..');

await test('prettier export is a plain options object', () => {
  assert.equal(typeof basePrettier, 'object');
  assert.equal(basePrettier.singleQuote, true);
  assert.equal(basePrettier.semi, true);
  assert.equal(basePrettier.trailingComma, 'all');
  assert.equal(basePrettier.plugins, undefined);
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
    const filepath = path.join(repoRoot, project, 'package.json');
    const resolved = await prettier.resolveConfig(filepath);
    assert.deepEqual(resolved, basePrettier, `${project} config differs`);
  }
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
  assert.equal(rules['@typescript-eslint/no-unused-vars']?.[0], 2);
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
