# ADR 0009: cms-api follows the NestJS CLI project defaults

- Status: proposed (2026-10-25). Scope and the `nest build` permission are user decisions (handoff, 2026-10-25); Q-NC1..Q-NC3 below are open.
- Date: 2026-10-25
- Starting point: DV1b (commit 5c50f23) already moved `start:dev` to `nest start --watch` and added the scaffold `nest-cli.json` and `@nestjs/cli` 11.0.24.
- Amends: DV1 design in `tasks/todo.md` (custom `tsc --watch` + `node --watch-path`), the cms-api README "Scripts" table

## Context

The user asked that cms-api use the configuration a project created with the NestJS CLI (`nest new`) has, instead of custom scripts: `nest build`, `start:prod` / `start:debug`, the scaffold tsconfig files, `nest-cli.json` and the dev watch. Building with `nest build` is allowed if `dist/main.js`, the Dockerfile, the smoke stack and CI keep working. apps/web (Next.js) is out of scope and does not change.

Facts checked on the repo (2026-10-25):

- `@nestjs/cli` 11.0.24 resolves `typescript` from the project first (`require.resolve('typescript', { paths: [process.cwd(), ...] })`), so `nest build` compiles with the pinned TypeScript 6.0.3 (ADR 0001), not the CLI's own 5.9.3.
- `nest build` with the default `tsc` compiler reads `tsconfig.build.json` and writes the same `dist/` layout as `tsc -p tsconfig.build.json` (`rootDir: src` -> `dist/main.js`). `src/` holds only `.ts` files (the Prisma client in `src/generated/prisma` is `.ts`), so no asset copying is needed.
- `nest-cli.json` already matches the scaffold byte for byte (`collection`, `sourceRoot`, `deleteOutDir: true`).
- Every consumer of the build calls a script or `dist/` path, never `tsc` directly: Dockerfile (`pnpm turbo run build`, then `CMD ["node", "dist/main.js"]`), smoke stack (same image), CI `cms-api.yml` (`turbo run build`, `content:generate`, `graphql:print-schema`, `contract:print`), turbo `build.outputs: dist/**`.
- The scaffold `tsconfig.json` does not extend a base and sets `strictPropertyInitialization: false`; the repo extends `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ...).

## Decision

### Module ownership

All of this lives in `apps/cms-api` package config only (`package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`). The NestJS CLI owns build, start and watch for cms-api; no other script compiles cms-api. Dockerfile, `docker-compose.smoke.yml`, CI workflows, `turbo.json` and the root `package.json` do not change. No application code changes.

### Scripts (`apps/cms-api/package.json`)

| Script                                                       | Before                                                                    | After (scaffold name and command)                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `build`                                                      | `tsc -p tsconfig.build.json`                                              | `nest build`                                                                       |
| `start`                                                      | `node dist/main.js`                                                       | `nest start` (builds, then runs; shell env only)                                   |
| `start:dev`                                                  | `nest start --watch --exec "node --env-file-if-exists=.env.local"` (DV1b) | unchanged                                                                          |
| `start:debug`                                                | none                                                                      | `nest start --debug --watch --exec "node --env-file-if-exists=.env.local"` (Q-NC3) |
| `start:prod`                                                 | none                                                                      | `node dist/main`                                                                   |
| `content:generate`, `graphql:print-schema`, `contract:print` | `tsc -p tsconfig.build.json && node ...`                                  | `nest build && node ...` (one build command for the package)                       |
| `dev`                                                        | `pnpm run start:dev`                                                      | unchanged (root `start:dev` calls it)                                              |

Not adopted, because the repo already has an owner for them: scaffold `format` (root Prettier), `lint` (oxlint + ESLint from `@abyss/base-config`), `test*` (Jest projects `unit` / `integration`), `test:e2e` (`apps/e2e`). The Dockerfile keeps `CMD ["node", "dist/main.js"]` (same as `start:prod`, without npm as PID 1). The root `start:cms-api` keeps calling `start`.

### tsconfig

- `tsconfig.json` keeps `extends: ../../tsconfig.base.json` and its `include` (`src`, `test`, `prisma.config.ts`, needed by `typecheck`, Jest and ESLint). It adds the scaffold options the base does not set: `removeComments: true`, `incremental: true`. Options the base already implies (`module`/`moduleResolution` `NodeNext`, `esModuleInterop`, `isolatedModules`, `declaration`, `sourceMap`, `skipLibCheck`, `target` ES2023) are not repeated. `strictPropertyInitialization` stays on (Q-NC1).
- `tsconfig.build.json` takes the scaffold shape: `rootDir: ./src`, `include: ["src"]`, `exclude: ["node_modules", "test", "dist", "**/*spec.ts"]`. It keeps `types: ["node"]` so Jest globals stay out of the production build.
- `incremental` needs `tsBuildInfoFile: ./dist/tsconfig.build.tsbuildinfo` in `tsconfig.build.json`. Without it the file lands in the package root, survives `deleteOutDir`, and the next build emits nothing (found in DV1c). Under `dist/` it is removed with `dist/`, so a build never skips emit after a clean.

### nest-cli.json

Unchanged (already the scaffold). `@nestjs/schematics` as a devDependency: Q-NC2.

### Names

Script names are the scaffold's (`start:prod`, `start:debug`), so a NestJS developer finds them without docs. No new env keys.

### Extension path

The next CLI option (an asset glob, `swc` builder, a plugin such as `@nestjs/swagger`) is one entry in `nest-cli.json` `compilerOptions`; scripts, Dockerfile and CI stay untouched because they call `build` / `dist/main.js` only. A second Nest app would get its own `nest-cli.json` in its own package (no root-level monorepo mode).

## Consequences

- `build` now deletes `dist/` first (`deleteOutDir`); stale files from removed sources no longer ship.
- Emitted JS has no comments (`removeComments`); source maps still map to the `.ts` files.
- `start` builds before running; production does not use it (image runs `node dist/main.js`).
- `nest generate` file names (kebab-case) do not match ADR 0008 once that is accepted; generated files must be renamed.

## Open questions

- **Q-NC1** `strictPropertyInitialization`: the scaffold sets it `false`. Recommended: keep it on (repo strict base; the current code compiles with it; turning it off only removes checks). Alternative: set it `false` to match the scaffold exactly; class fields may then be read before assignment without an error.
- **Q-NC2** `@nestjs/schematics` devDependency: the scaffold lists it, and `nest-cli.json` names it as `collection`. Recommended: add it, pinned to the version already in the lockfile through `@nestjs/cli` (no new package to vet), so `nest generate` works. Alternative: leave it out; `nest build` / `nest start` do not need it, but `nest generate` may fail to find the collection.
- **Q-NC3** `start:debug` loads `.env.local`: recommended yes, same `--exec` as `start:dev` (it is a dev command, and without the file it fails the config check). Alternative: plain scaffold `nest start --debug --watch`, which reads the shell env only.
