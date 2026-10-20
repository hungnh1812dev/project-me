// @ts-check
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const prettier = require('prettier');

const config = require('@abyss/prettier-config');

test('exports a plain options object', () => {
  assert.equal(typeof config, 'object');
  assert.equal(config.singleQuote, true);
  assert.equal(config.semi, true);
  assert.equal(config.trailingComma, 'all');
});

test('a project .prettierrc.cjs resolves to the shared config', async () => {
  const filepath = path.join(__dirname, '..', 'index.cjs');
  const resolved = await prettier.resolveConfig(filepath);
  assert.deepEqual(resolved, config);
});

test('formats code with the shared style', async () => {
  const output = await prettier.format('const a = {b: "c", d: [1,2]}', {
    ...config,
    parser: 'babel',
  });
  assert.equal(output, "const a = { b: 'c', d: [1, 2] };\n");
});
