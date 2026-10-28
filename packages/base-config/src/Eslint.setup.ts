import js from '@eslint/js';
import type { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import {
  CHECKED_EXTENSIONS,
  DEFAULT_SCANNED_FOLDERS,
  fileNamesRule,
  type FileNameRuleOptions,
} from './FileNames.eslint.ts';

export type { FileNameRuleOptions };

/**
 * Files no project lints with type information: build output, coverage,
 * CommonJS/ESM scripts and the Oxlint config (outside every tsconfig).
 */
export const sharedIgnores = [
  'dist/**',
  'coverage/**',
  '*.cjs',
  '*.mjs',
  'oxlint.config.ts',
];

/** Unused names that start with an underscore are intentional. */
const unusedVarsOptions = {
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrorsIgnorePattern: '^_',
};

const typescriptFiles = ['**/*.{ts,tsx,mts,cts}'];
const javascriptFiles = ['**/*.{js,jsx}'];

export interface BaseEslintOptions {
  /** Directory of the project's tsconfig.json; pass `import.meta.dirname`. */
  tsconfigRootDir: string;
  /** Project-specific ignores, added to the shared ones. */
  ignores?: string[];
  /** Turns on `abyss/file-names`; `{}` means all defaults. Off when omitted. */
  fileNames?: FileNameRuleOptions;
}

const abyssPlugin = { rules: { 'file-names': fileNamesRule } };

/**
 * Flat config holding the rules every project shares. A project spreads it
 * first and adds its own globals, plugins and rules after it.
 *
 * @example
 *   export default [
 *     ...baseEslint({ tsconfigRootDir: import.meta.dirname }),
 *     { languageOptions: { globals: globals.node } },
 *   ];
 */
export default function baseEslint(
  options: BaseEslintOptions,
): Linter.Config[] {
  const fileNames = options.fileNames;
  return [
    { ignores: [...sharedIgnores, ...(options.ignores ?? [])] },
    js.configs.recommended,
    ...(tseslint.configs.recommendedTypeChecked as Linter.Config[]),
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: options.tsconfigRootDir,
        },
      },
    },
    {
      files: typescriptFiles,
      rules: {
        '@typescript-eslint/no-unused-vars': ['error', unusedVarsOptions],
      },
    },
    {
      files: javascriptFiles,
      rules: { 'no-unused-vars': ['error', unusedVarsOptions] },
    },
    ...(fileNames ? [fileNamesConfig(fileNames)] : []),
  ];
}

function fileNamesConfig(fileNames: FileNameRuleOptions): Linter.Config {
  const folders = fileNames.scannedFolders ?? DEFAULT_SCANNED_FOLDERS;
  return {
    files: folders.map((f) => `${f}/**/*.{${CHECKED_EXTENSIONS.join(',')}}`),
    plugins: { abyss: abyssPlugin },
    rules: { 'abyss/file-names': ['error', fileNames] },
  };
}
