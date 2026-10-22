# @abyss/base-config

Shared Prettier, ESLint and Oxlint configs for every app and package in the
Abyss monorepo. The shared configs hold only the rules all projects agree on.
Each project imports them and adds its own plugins, globals and rules.

The sources are TypeScript files in `src/`, loaded directly (Node 24 strips the
types), so there is no build step and `pnpm format` / `pnpm lint` work on a
fresh clone. They use erasable TypeScript syntax only (no enums, no
namespaces) and explicit `.ts` import extensions.

## Exports

| Export                        | Holds                                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@abyss/base-config/prettier` | A Prettier `Config`: 80 columns, single quotes, semicolons, trailing commas, LF. No plugins.                                                                                                               |
| `@abyss/base-config/eslint`   | `baseEslint({ tsconfigRootDir, ignores? })`, a flat config array: `@eslint/js` recommended, `typescript-eslint` `recommendedTypeChecked` with the project service, shared ignores, `_`-prefix unused vars. |
| `@abyss/base-config/oxlint`   | An Oxlint config: `typescript` plugin, `correctness` as error, `suspicious` as warn, `_`-prefix unused vars, shared ignores.                                                                               |

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

## Scripts

| Script                                       | What it does                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------- |
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
