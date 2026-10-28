import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import baseEslint, {
  type FileNameRuleOptions,
} from '@abyss/base-config/eslint';

const linter = new Linter({ configType: 'flat' });
/** Linter's answer for a file no config block matches; ESLint itself skips it. */
const NOT_LINTED_MESSAGE = 'No matching configuration found';
const noExports = 'const value = 1;\n';

function lint(
  fileName: string,
  code: string,
  options: FileNameRuleOptions = {},
): string[] {
  const ruleBlock = baseEslint({
    tsconfigRootDir: '/',
    fileNames: options,
  }).find((block) => block.plugins?.abyss);
  assert.ok(ruleBlock);
  const messages = linter.verify(
    code,
    [
      {
        ...ruleBlock,
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
      },
    ],
    { filename: fileName },
  );
  return messages
    .map((message) => message.message)
    .filter((message) => !message.startsWith(NOT_LINTED_MESSAGE));
}

function assertAccepted(
  fileName: string,
  code = noExports,
  options?: FileNameRuleOptions,
) {
  assert.deepEqual(lint(fileName, code, options), [], fileName);
}

function assertRejected(
  fileName: string,
  pattern: RegExp,
  code = noExports,
  options?: FileNameRuleOptions,
) {
  const messages = lint(fileName, code, options);
  assert.equal(messages.length, 1, `${fileName}: ${messages.join(' | ')}`);
  assert.match(messages[0] ?? '', pattern, fileName);
}

const hookCode = 'export function useSetupStatus() { return 1; }\n';

await test('accepts the documented shapes', () => {
  assertAccepted('src/modules/access/AccessPolicy.service.ts');
  assertAccepted('src/Auth.service.refresh.spec.ts');
  assertAccepted('src/LoginPage.tsx');
  assertAccepted('src/useSetupStatus.ts', hookCode);
  assertAccepted('src/useSetupStatus.test.ts');
  assertAccepted('src/Access.queries.ts');
  assertAccepted('src/Server.env.mjs');
  assertAccepted('src/index.ts');
  assertAccepted('src/vite-env.d.ts');
  assertAccepted('src/features/auth-flow/Login.tsx');
});

await test('accepts framework names with and without a test suffix', () => {
  const options = { frameworkFileNames: ['index.ts', 'page.tsx'] };
  assertAccepted('src/page.tsx', noExports, options);
  assertAccepted('src/page.test.tsx', noExports, options);
  assertRejected('src/layout.tsx', /PascalCase/, noExports, options);
});

await test('rejects a folder that is not kebab-case', () => {
  assertRejected('src/BadFolder/Login.tsx', /Folder "BadFolder"/);
  assertRejected('src/bad_folder/Login.tsx', /Folder "bad_folder"/);
});

await test('accepts route folders only when allowed', () => {
  const options = { allowsRouteSegmentFolders: true };
  assertAccepted('src/app/[slug]/Post.tsx', noExports, options);
  assertAccepted('src/app/(group)/[...rest]/Post.tsx', noExports, options);
  assertAccepted('src/app/_private/@slot/Post.tsx', noExports, options);
  assertRejected('src/app/[slug]/Post.tsx', /Folder "\[slug\]"/);
  assertRejected('src/app/[Bad Slug]/Post.tsx', /Folder/, noExports, options);
});

await test('rejects a file name that is not PascalCase', () => {
  assertRejected('src/bad-name.ts', /"bad-name" must be PascalCase/);
  assertRejected('src/vite.config.ts', /"vite" must be PascalCase/);
});

await test('rejects upper-case words and too many parts', () => {
  assertRejected('src/Access.Service.ts', /lower-case/);
  assertRejected('src/Access.service.extra.ts', /Too many dot parts/);
  assertRejected('src/Access.a.b.c.spec.ts', /Too many dot parts/);
});

await test('rejects a word that repeats the end of the name', () => {
  assertRejected('src/UserService.service.ts', /repeats/);
  assertRejected('src/AccessError.errors.ts', /repeats/);
  assertRejected('src/UserService.service.spec.ts', /repeats/);
});

await test('requires a word only when isWordRequired is set', () => {
  assertAccepted('src/Health.ts');
  assertRejected('src/Health.ts', /needs a function word/, noExports, {
    isWordRequired: true,
  });
  assertAccepted('src/Health.service.ts', noExports, { isWordRequired: true });
});

await test('honours the configured test suffixes', () => {
  assertAccepted('tests/Login.e2e.spec.ts', noExports, {
    testSuffixes: ['spec'],
  });
  assertRejected(
    'tests/Login.e2e.test.ts',
    /Too many dot parts|lower/,
    noExports,
    {
      testSuffixes: ['spec'],
    },
  );
});

await test('requires a hook file to export its hook', () => {
  assertRejected('src/useThing.ts', /must export a value named "useThing"/);
  assertRejected(
    'src/useThing.ts',
    /must export a value named "useThing"/,
    'export type useThing = string;\n',
  );
  assertAccepted('src/useThing.ts', 'export const useThing = () => 1;\n');
  assertAccepted(
    'src/useThing.ts',
    'function a() {}\nexport { a as useThing };\n',
  );
});

await test('rejects a non-hook file that only exports one hook', () => {
  assertRejected(
    'src/Thing.ts',
    /name the file "useThing"/,
    'export function useThing() {}\n',
  );
  assertAccepted(
    'src/Thing.ts',
    'export function useThing() {}\nexport const other = 1;\n',
  );
  assertAccepted('src/Thing.ts', 'export const useThing = 1;\n');
});

await test('skips files outside the scanned folders and other file types', () => {
  assertAccepted('vite.config.ts');
  assertAccepted('scripts/bad-name.ts');
  assertAccepted('src/bad-name.css');
  assertAccepted('src/bad-name.json');
  assertAccepted('lib/bad-name.ts', noExports, { scannedFolders: ['lib2'] });
  assertRejected('lib/bad-name.ts', /PascalCase/, noExports, {
    scannedFolders: ['lib'],
  });
});

await test('is off when fileNames is not passed', () => {
  const blocks = baseEslint({ tsconfigRootDir: '/' });
  assert.equal(
    blocks.some((block) => block.plugins?.abyss),
    false,
  );
});
