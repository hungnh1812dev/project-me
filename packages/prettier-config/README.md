# @abyss/prettier-config

Shared Prettier options for every app and package in the Abyss monorepo.

## Use in a project

1. Add the dev dependency: `"@abyss/prettier-config": "workspace:*"`.
2. Create `.prettierrc.cjs` in the project root:

   ```js
   module.exports = require('@abyss/prettier-config');
   ```

Run `pnpm format` from the repository root before every commit.

## Scripts

| Script                                           | What it does                                            |
| ------------------------------------------------ | ------------------------------------------------------- |
| `pnpm --filter @abyss/prettier-config test`      | Checks the config shape and that it formats as expected |
| `pnpm --filter @abyss/prettier-config lint`      | Oxlint, then ESLint                                     |
| `pnpm --filter @abyss/prettier-config typecheck` | `tsc` over the JS sources with `checkJs`                |
