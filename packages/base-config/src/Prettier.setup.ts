import { createRequire } from 'node:module';

import type { PluginConfig } from '@ianvs/prettier-plugin-sort-imports';
import type { Config } from 'prettier';
import type { PluginOptions } from 'prettier-plugin-tailwindcss';

// Prettier loads bare plugin names from the working directory, so every consumer would need its
// own copy; resolving from this package lets them install nothing.
const resolvePlugin = createRequire(import.meta.url).resolve;

export type PrettierBaseConfig = Config & PluginConfig & PluginOptions;

/**
 * Shared Prettier options for every Abyss app and package.
 * Values follow the code style in SPEC.md §10 (single quotes, semicolons,
 * trailing commas); everything else is the Prettier default, stated explicitly
 * so a Prettier upgrade cannot silently change the output.
 */
const config: PrettierBaseConfig = {
  // Layout & spacing
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  endOfLine: 'lf',

  // Syntax
  semi: true,
  singleQuote: true,
  jsxSingleQuote: false,
  quoteProps: 'as-needed',
  trailingComma: 'all',
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'always',

  plugins: [
    resolvePlugin('@ianvs/prettier-plugin-sort-imports'),
    resolvePlugin('prettier-plugin-tailwindcss'),
  ],

  // Import Sorter
  importOrder: [
    '<BUILTIN_MODULES>',
    '',
    '^(react|react-dom)(/.*)?$',
    '^next(/.*)?$',
    '^@nestjs/(.*)$',
    '<THIRD_PARTY_MODULES>',
    '',
    '^@repo/(.*)$',
    '',
    `@/styles/global.css`,
    '',
    '^@/(.*)$',
    '',
    '^[.]',
    '',
    '\\.css$',
  ],
  importOrderTypeScriptVersion: '6.0.2',
  // NestJS uses decorators; without this the import sorter can't parse those files.
  importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],

  overrides: [
    // {
    //   files: ['./src/**'],
    //   options: {
    //     tailwindStylesheet: './src/assets/styles/global.css',
    //     tailwindFunctions: ['clsx', 'cn', 'cva'],
    //   },
    // },
    {
      files: ['*.json', '*.jsonc'],
      options: { trailingComma: 'none' },
    },
    {
      files: ['*.md', '*.yaml', '*.yml'],
      options: { proseWrap: 'preserve' },
    },
  ],
};

export default config;
