# @abyss/base-config

Shared Prettier, ESLint and Oxlint configs for every app and package in the
Abyss monorepo. The shared configs hold only the rules all projects agree on.
Each project imports them and adds its own plugins, globals and rules.

The sources are TypeScript files in `src/` (erasable syntax only, no enums or
namespaces). File names follow ADR 0008 (`Eslint.setup.ts`, `Oxlint.setup.ts`,
`Prettier.setup.ts`); the `abyss/file-names` rule below checks it. The
sources are built with `tsc` to `dist/` (ESM, with `.d.ts` files),
and every export points at `dist/`. Turbo builds the package before any
consumer's `lint`, `typecheck`, `test` or `build`, and the root `pnpm format`
and `pnpm format:check` build it first, so nothing needs a manual build.

After a fresh clone, editor integrations (the ESLint and Prettier extensions)
do not run turbo. Run `pnpm --filter @abyss/base-config build` once so they
find `dist/`.

## Exports

| Export                        | Holds                                                                                                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@abyss/base-config/prettier` | A Prettier `Config`: 80 columns, single quotes, semicolons, trailing commas, LF. No plugins.                                                                                                                                                                   |
| `@abyss/base-config/eslint`   | `baseEslint({ tsconfigRootDir, ignores?, fileNames? })`, a flat config array: `@eslint/js` recommended, `typescript-eslint` `recommendedTypeChecked` with the project service, shared ignores, `_`-prefix unused vars, and the opt-in `abyss/file-names` rule. |
| `@abyss/base-config/oxlint`   | An Oxlint config: `typescript` plugin, `correctness` as error, `suspicious` as warn, `_`-prefix unused vars, shared ignores.                                                                                                                                   |

There is no React, Next, Jest or Prettier-as-lint rule in the base.

## Use in a project

1. Add the dev dependency `"@abyss/base-config": "workspace:*"`, plus `eslint`,
   `oxlint` and (for globals) `globals`.
2. Prettier, in `.prettierrc.cjs`:

   ```js
   module.exports = require('@abyss/base-config/prettier').default;
   ```

3. ESLint, in `eslint.config.mjs`. Spread the base first, then add the local
   part:

   ```js
   import baseEslint from '@abyss/base-config/eslint';
   import globals from 'globals';

   export default [
     ...baseEslint({
       tsconfigRootDir: import.meta.dirname,
       ignores: ['src/generated/**'],
     }),
     { languageOptions: { globals: globals.node } },
   ];
   ```

4. Oxlint, in `oxlint.config.ts`. List the base in `extends` and set the
   project's own plugins (the base does not carry them over), env, ignores and
   rules:

   ```ts
   import baseOxlint from '@abyss/base-config/oxlint';
   import { defineConfig } from 'oxlint';

   export default defineConfig({
     extends: [baseOxlint],
     plugins: ['typescript', 'jest', 'node'],
     env: { node: true, jest: true },
     ignorePatterns: ['src/generated'],
   });
   ```

Examples per project type:

| Project type     | ESLint local part                                                                     | Oxlint local part                                  |
| ---------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Nest (cms-api)   | `globals.node`, ignore `src/generated/**`                                             | plugins `jest`, `node`; env node + jest            |
| Playwright (e2e) | `globals.node`, ignore the report folders                                             | env node, ignore the report folders                |
| React / Vite     | `globals.browser`, `eslint-plugin-react-hooks` `flat['recommended-latest']`           | plugins `react`, `jsx-a11y`, `vitest`; env browser |
| Next (web)       | as React / Vite, plus `@next/eslint-plugin-next` `core-web-vitals`, ignore `.next/**` | as React / Vite, ignore `.next`                    |

Run `pnpm format` from the repository root before every commit.

## The `abyss/file-names` rule

ADR 0008 as a lint rule, defined in `src/FileNames.eslint.ts` and exposed as
the local plugin `abyss`. It is off until a project passes `fileNames` to
`baseEslint` (`fileNames: {}` means all defaults). It then runs as `error` on
`.ts`, `.tsx`, `.js`, `.jsx` and `.mjs` files under the scanned folders; other
file types and files outside those folders are not checked.

It reports: a folder that is not kebab-case; a file name that is not
`<use?><PascalName>[.<word>].<ext>` (tests:
`<use?><PascalName>[.<word>][.<variant>].<test suffix>.<ext>`, lower-case
words); a word that repeats the end of the name (`AccessError.errors.ts`); a
missing word when required; a `use<Name>` file without a value export named
`use<Name>`; a file whose only value export is one `use...` function.

| Option                      | Default                    | Meaning                                                                                      |
| --------------------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| `frameworkFileNames`        | `['index.ts']`             | Exact names accepted as they are, also with a test suffix (`page.test.tsx`). `*.d.ts` always |
| `allowsRouteSegmentFolders` | `false`                    | Accept `[slug]`, `[...slug]`, `(group)`, `_private`, `@slot` folders                         |
| `isWordRequired`            | `false`                    | Every file needs a word: `<PascalName>.<word>.ts`                                            |
| `testSuffixes`              | `['test', 'spec']`         | Suffixes that mark a test file                                                               |
| `scannedFolders`            | `['src', 'test', 'tests']` | Top-level folders checked, relative to the lint working directory                            |

## Scripts

| Script                                       | What it does                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm --filter @abyss/base-config build`     | `tsc` from `src` to `dist/`                                                |
| `pnpm --filter @abyss/base-config test`      | Checks each export loads, formats as expected and resolves in each project |
| `pnpm --filter @abyss/base-config lint`      | Oxlint, then ESLint                                                        |
| `pnpm --filter @abyss/base-config typecheck` | `tsc` over `src`, `test` and the root config files                         |

## Gotchas

- Oxlint allows only one of `.oxlintrc.json` and `oxlint.config.ts` per
  directory. A project that moves to `oxlint.config.ts` must delete its
  `.oxlintrc.json`.
- In a CommonJS project (no `"type": "module"`, such as cms-api) Node prints a
  `MODULE_TYPELESS_PACKAGE_JSON` warning when Oxlint loads `oxlint.config.ts`.
  It is harmless.
- `oxlint.config.ts` is in the shared ESLint ignores (it is outside every
  tsconfig).
