/**
 * Shared Prettier config for the whole workspace.
 * @type {import('prettier').Config & import('@ianvs/prettier-plugin-sort-imports').PluginConfig & import('prettier-plugin-tailwindcss').PluginOptions}
 */
export default {
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

  plugins: ['@ianvs/prettier-plugin-sort-imports', 'prettier-plugin-tailwindcss'],

  // Import order: node builtins → react/next → third-party → @repo/* → aliases → relative → styles
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
    {
      files: 'apps/frontend/**',
      options: {
        tailwindStylesheet: './apps/frontend/src/app/globals.css',
        tailwindFunctions: ['clsx', 'cn', 'cva'],
      },
    },
    {
      files: 'apps/cms-admin/**',
      options: {
        tailwindStylesheet: './apps/cms-admin/src/styles/globals.css',
        tailwindFunctions: ['clsx', 'cn', 'cva'],
      },
    },
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
