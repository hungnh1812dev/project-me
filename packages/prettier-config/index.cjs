// @ts-check

/**
 * Shared Prettier options for every Abyss app and package.
 * Values follow the code style in SPEC.md §10 (single quotes, semicolons,
 * trailing commas); everything else is the Prettier default, stated explicitly
 * so a Prettier upgrade cannot silently change the output.
 *
 * @type {import('prettier').Config}
 */
const config = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  jsxSingleQuote: false,
  quoteProps: 'as-needed',
  trailingComma: 'all',
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'always',
  endOfLine: 'lf',
};

module.exports = config;
