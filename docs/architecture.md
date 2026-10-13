# Architecture

A pnpm + Turborepo monorepo with three independently deployable apps and a set of shared packages. Each app ships as its own Docker image, and a change in one app never rebuilds another.

## Layout

```text
.
├── apps/
│   ├── cms-api/            # NestJS backend API
│   ├── cms-admin/          # React + Vite admin portal (served by nginx)
│   └── frontend/           # Next.js public site + BFF (route handlers)
├── packages/
│   ├── types/              # @repo/types: shared TS types (empty for now)
│   ├── form-commons/       # @repo/form-commons: shared UI primitives (components/ui), form components (components/forms) and Tailwind theme
│   ├── eslint-config/      # @repo/eslint-config: base flat config
│   └── typescript-config/  # @repo/typescript-config: base tsconfig
├── .github/
│   ├── workflows/
│   │   ├── ci.yml          # entrypoint: triggers, changes, one call per affected app (see ci-cd.md)
│   │   ├── cms-api.yml     # workflow_call: checks -> build -> publish(cms-api)
│   │   ├── cms-admin.yml   # workflow_call: checks -> build -> publish(cms-admin, VITE_API_URL, smoke check)
│   │   ├── frontend.yml    # workflow_call: checks -> build -> publish(frontend)
│   │   └── _publish.yml    # workflow_call: image (+ non-root guard) -> manifest -> deploy for one app
│   └── scripts/
│       ├── affected.sh       # affected apps, image apps, workflow-file routing -> GITHUB_OUTPUT
│       ├── affected.test.sh  # local assertions for affected.sh
│       ├── image-user.sh     # non-root guard: numeric non-zero USER that matches id -u
│       └── bundle-check.sh   # cms-admin bundle smoke check for the baked API base
├── docs/                   # this documentation
├── package.json            # private root: scripts -> turbo, pins pnpm via packageManager
├── pnpm-workspace.yaml     # apps/*, packages/*, build-script allowlist
├── turbo.json              # tasks: build, dev, lint, typecheck, test
└── .nvmrc                  # 24
```

**Conventions:**

- **Names:** shared packages use the `@repo/*` scope, and apps have unscoped names that match their folder (`turbo prune` and CI depend on this).
- **Privacy:** every package is `private: true`.
- **Internal dependencies:** use `workspace:*`.
- **Lockfile:** there is one lockfile, the root `pnpm-lock.yaml`.

`cms-admin` and `frontend` depend on `@repo/form-commons` (`workspace:*`), so turbo's change detection rebuilds both when the package changes, and `turbo prune` puts it in their Docker builds. No app depends on `@repo/types` yet.

## Shared form-commons package (`@repo/form-commons`)

`packages/form-commons` holds the shadcn/ui primitives (Base UI flavour) in `src/components/ui`, the generic form components in `src/components/forms` (`Field`, `GatedButton`, `Pagination`, …), pure helpers (`cn`, `json`, `pagination`, `Decision`) and the shared Tailwind v4 theme. The admin-specific form components stay in cms-admin.

- **No build step.** The package ships TypeScript source with subpath `exports` (`@repo/form-commons/components/ui/*`, `@repo/form-commons/components/forms/*`, `@repo/form-commons/hooks/*`, `@repo/form-commons/lib/*`, `@repo/form-commons/styles/theme.css`, `@repo/form-commons/styles/tokens`). Vite compiles it in cms-admin, and Next compiles it in frontend through `transpilePackages: ['@repo/form-commons']`.
- **Theme.** Each app's global CSS imports `@repo/form-commons/styles/theme.css` and adds `@source '../../../../packages/form-commons/src'`, so Tailwind generates the package's classes.
- **shadcn CLI.** `packages/form-commons/components.json` sets the `ui` alias to `@repo/form-commons/components/ui`, and the package `tsconfig.json` maps `@repo/form-commons/*` to `./src/*` so the CLI resolves its aliases; new primitives land in `src/components/ui`.
- **Client components.** Every `.tsx` module in `src/components/ui` and `src/components/forms` starts with `'use client'`, for Next's App Router.
- **TypeScript 5 and 6.** The package is written under cms-admin's TS 6. `apps/frontend/src/ui-compile-check.ts` re-exports every `components/ui` and `components/forms` entry so frontend's TS 5 typechecks it too; add new entries there.
- **Boundaries.** Unit tests in the package fail on imports through `@/`, from `apps/*`, or from app-only libraries (router, axios, Redux, TanStack, react-hook-form), on a missing `'use client'`, and on raw hex or palette classes in any `.tsx` file of the package or cms-admin.
- **Tests.** `pnpm --filter @repo/form-commons test`, or `test:cov` for the coverage gates (`src/components/forms` at 70%, `src/lib` and `tokens.ts` at 85%; the vendored `src/components/ui` are excluded). The root `pnpm test` runs them too.

See [cms-admin's design system](../apps/cms-admin/docs/design-system.md) for the components, tokens and palette.

## Apps

| App         | Stack                                             | Dev command                       | Dev port | Lint                | Tests                                                 | Container port |
| ----------- | ------------------------------------------------- | --------------------------------- | -------- | ------------------- | ----------------------------------------------------- | -------------- |
| `cms-api`   | NestJS 12, TypeScript 6, ESM                      | `pnpm --filter cms-api start:dev` | 3000     | oxlint (type-aware) | Vitest (`test`, `test:e2e`)                           | 3000           |
| `cms-admin` | Vite 8, React 19, TypeScript 6                    | `pnpm --filter cms-admin dev`     | 5173     | oxlint              | Vitest (`test`, `test:cov`) + Playwright (`test:e2e`) | 8080 (nginx)   |
| `frontend`  | Next.js 16.3 (App Router, Tailwind), TypeScript 5 | `pnpm --filter frontend dev`      | 3000     | ESLint 9            | none                                                  | 3000           |

Each app keeps its generator's own tooling and versions. That's why TypeScript and lint tools differ between apps, and it's intentional. Nest 12 has no `dev` script, so `pnpm dev` at the root doesn't start cms-api.

## Turbo tasks

| Task        | Depends on | Notes                                                                                                                                                                                                                                      |
| ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `build`     | `^build`   | outputs `dist/**`, `.next/**` (minus cache)                                                                                                                                                                                                |
| `typecheck` | `^transit` | `tsc --noEmit`. cms-admin uses `tsc -b --noEmit`. frontend runs `next typegen` first, because `next-env.d.ts` is gitignored. Inputs: `$TURBO_DEFAULT$` minus `**/*.md` and `docs/**`                                                       |
| `transit`   | `^transit` | transit node (no package has a `transit` script, nothing runs). Carries the dependencies' source hashes into `typecheck`, so typecheck tasks run in parallel but still miss when a dependency's source changes. Same inputs as `typecheck` |
| `lint`      | —          | each workspace lints only its own files, so lint tasks run in parallel. Inputs: `$TURBO_DEFAULT$` minus `**/*.md` and `docs/**`                                                                                                            |
| `test`      | `^build`   | runs the cms-api, cms-admin and `@repo/form-commons` unit tests (Vitest). e2e suites (`test:e2e`) and coverage (`test:cov`) run per workspace                                                                                              |
| `dev`       | —          | persistent, not cached                                                                                                                                                                                                                     |

Before changing `turbo.json`, read the docs bundled with the installed turbo (`node_modules/turbo/docs/`). See the root `AGENTS.md`.

## Docker images

Every Dockerfile builds from the **repo root** (`docker build -f apps/<app>/Dockerfile .`) and isolates its app with `turbo prune <app> --docker`, so the image only contains that app and its workspace dependencies.

| App         | Stages                                                     | Runtime                                                                       | Runtime user | Size (unpacked / compressed) |
| ----------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------ | ---------------------------- |
| `cms-api`   | prepare (prune) → manifests → prod-deps / builder → runner | `node:24-alpine`, `node dist/main`                                            | `abyss` 1001 | ~200MB / 64MB                |
| `cms-admin` | prepare → builder → runner                                 | `nginx-unprivileged:alpine`, SPA fallback, `/assets/` cache                   | `abyss` 1001 | ~93MB                        |
| `frontend`  | prepare → builder → runner                                 | `node:24-alpine`, Next `output: 'standalone'`, `node apps/frontend/server.js` | `abyss` 1001 | ~217MB / 75MB                |

About 176MB of each Node image is the `node:24-alpine` base.

**Runtime user.** Every runner stage creates the system user `abyss` (UID/GID **1001**, no home, shell `/sbin/nologin`), gives it the paths it writes or ships (cms-api and frontend copy with `--chown=1001:1001`; cms-admin chowns the nginx config and cache paths) and ends with a numeric `USER 1001`, so Kubernetes `runAsNonRoot` can verify it. The `node` user (1000) of `node:24-alpine` and nginx-unprivileged's `nginx` (101) stay in the base images, unused. In Kubernetes, use `runAsNonRoot: true` with `runAsUser: 1001`; cms-api and frontend overlays that pin `runAsUser`/`fsGroup` 1000 must move to 1001. CI enforces this with `.github/scripts/image-user.sh` before every push (see [ci-cd.md](ci-cd.md#non-root-guard)).

**cms-admin API origin.** `VITE_API_URL` is a builder-stage build arg (`--build-arg VITE_API_URL=https://cms-api.example.com`), baked into the bundle by Vite. In CI it comes from the GitHub Environment variable of the same name; empty means the relative `/api/v1`. `.env*` files never reach any image (`.dockerignore`).

**Why it's built this way:**

- **Next standalone output**, with `outputFileTracingRoot` set to the monorepo root so pnpm's hoisted `node_modules` get traced. A custom `server.ts` was tried and dropped: it can't be combined with standalone, and the image was ~570MB without it.
- **`pnpm deploy --legacy --prod`** gives cms-api production-only dependencies. Plain `pnpm deploy` would require `injectWorkspacePackages: true` workspace-wide, which breaks live linking of `@repo/*` in local dev.
- **Layer caching:**
  - Dependency layers only rebuild when manifests or the lockfile change.
  - A change in another app reuses every layer, and only `turbo prune` (~0.1s) re-runs.
  - BuildKit cache mounts cover the pnpm store, turbo's cache and Next's build cache.
- **In CI,** layer caching comes from the GitHub Actions cache (`type=gha`, one scope per app and arch). Cache mounts don't carry over between CI runs.

## Editor and tooling performance

Goal: less tsserver and ESLint CPU and memory in VS Code (idle, during `pnpm build` / `next dev`, and on CLI `lint` / `typecheck`) without weakening type safety or changing lint rules.

### Committed VS Code settings

| Setting (`.vscode/settings.json`)         | Value                                                                                                                                                                                          | Reason                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `files.watcherExclude`                    | `.next/{cache,server,static,standalone,build,turbopack}`, `.next/dev/{cache,server,static,build,logs}`, `dist`, `.turbo`, `coverage`, `test-results`, `playwright-report`, `node_modules/.tmp` | Build outputs and caches change on every rebuild. Each change event reaches tsserver and the ESLint server. `.next/types` and `.next/dev/types` stay watched on purpose: Next writes the route types there and tsserver must see them refresh during `next dev`. |
| `search.exclude`                          | all of `.next`, `dist`, `.turbo`, `coverage`, `test-results`, `playwright-report`                                                                                                              | Search and quick-open skip generated files.                                                                                                                                                                                                                      |
| `typescript.tsdk`                         | `apps/cms-admin/node_modules/typescript/lib`                                                                                                                                                   | One TypeScript (6.0.2, the version most workspaces use) instead of VS Code's bundled one.                                                                                                                                                                        |
| `typescript.enablePromptUseWorkspaceTsdk` | `true`                                                                                                                                                                                         | VS Code asks once to switch to the workspace version. Accept it; the status bar then shows 6.0.2.                                                                                                                                                                |
| `eslint.workingDirectories`               | `[{ "directory": "apps/frontend", "changeProcessCWD": true }]`                                                                                                                                 | Only `apps/frontend` uses ESLint. Without this the extension tries to resolve ESLint and a config for every file in the repo.                                                                                                                                    |

`.vscode/extensions.json` recommends `dbaeumer.vscode-eslint` (frontend) and `oxc.oxc-vscode` (cms-admin, cms-api and form-commons, each with its own `.oxlintrc.json`).

Defaults kept on purpose (not set in the committed settings): `eslint.run` (`onType`), `typescript.preferences.includePackageJsonAutoImports` (`auto`), `typescript.disableAutomaticTypeAcquisition` (`false`) and `oxc.typeAware` (off, so the editor doesn't run tsgolint; CLI and CI still run type-aware lint for cms-api).

### tsgo opt-in (per developer)

`@typescript/native-preview` (tsgo) is a root devDependency. It is the main lever for editor memory, but it stays opt-in and the committed settings never enable it. CLI `typecheck` keeps using each workspace's `tsc`.

- **Turn on:** install the "TypeScript (Native Preview)" extension (`TypeScriptTeam.native-preview`), then add `"typescript.experimental.useTsgo": true` to your own User settings (not `.vscode/settings.json`) and run "Developer: Reload Window".
- **Turn off:** set `typescript.experimental.useTsgo` to `false` (or remove it) and reload. The status bar goes back to TypeScript 6.0.2.
- CLI check: `pnpm exec tsgo --version`.

### cms-api tsconfig layout

`apps/cms-api` follows the cms-admin pattern: `tsconfig.json` is solution-style (`files: []`) and only references two projects.

| File                  | Covers                                                                  | `types`                      | tsbuildinfo                                   |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------- | --------------------------------------------- |
| `tsconfig.app.json`   | `src` without `*.spec.ts` (`composite`)                                 | `["node"]`                   | `node_modules/.tmp/tsconfig.app.tsbuildinfo`  |
| `tsconfig.spec.json`  | `src/**/*.spec.ts`, `test/`, `vitest.config.ts`, `vitest.config.e2e.ts` | `["vitest/globals", "node"]` | `node_modules/.tmp/tsconfig.spec.tsbuildinfo` |
| `tsconfig.build.json` | extends `tsconfig.app.json`, `rootDir: ./src`; used by `nest build`     | inherited                    | `dist/tsconfig.build.tsbuildinfo`             |

- `typecheck` is `tsc -b --noEmit`. Its tsbuildinfo files live in `node_modules/.tmp/`, so `nest build` (`deleteOutDir`) doesn't wipe them and a warm run is cheap.
- `tsconfig.build.json` writes its own tsbuildinfo into `dist/`. Sharing the app tsbuildinfo would make `nest build` overwrite it with build options, and the next `typecheck` would check the app project again. Inside `dist/` it is deleted with the output on every build, so a clean build always emits everything.
- The spec project has no `references` to the app project: `tsc -b --noEmit` rejects a referenced project that doesn't emit (TS6310). Each first-party file belongs to exactly one project (the editor opens `tsconfig.app.json` for `src/app.service.ts` and `tsconfig.spec.json` for `src/app.controller.spec.ts`); the spec program still loads the `src` files that tests import.
- `oxlint --type-aware` (tsgolint) resolves both referenced projects; a floating promise is reported in `src/` and in `test/`.

### frontend tsconfig and ESLint cache

- `tsconfig.json` sets `tsBuildInfoFile: ./node_modules/.tmp/tsconfig.tsbuildinfo` (the app root no longer gets a `tsconfig.tsbuildinfo`) and `exclude: ["node_modules", ".next/standalone", "out", "build"]`. TS wildcards already skip dot-folders, so `.next/standalone` was not in the program before either; the exclude keeps it out if the `include` list ever names `.next/**` more broadly. `.next/types` and `.next/dev/types` stay included for route types.
- `typecheck` stays `next typegen && tsc --noEmit`. Warm, `tsc` skips the check phase (Check time 0.76 s goes to 0) but still builds the program (Program time about 0.78 s for 1,449 files), so a warm run can't drop under about 60% of a cold one. Split of a warm `pnpm typecheck` (1.6 s): pnpm start-up about 0.25 s, `next typegen` about 0.25 s, `tsc` about 1.1 s.
- `lint` is `eslint --cache --cache-strategy content --cache-location node_modules/.cache/eslint/`. Most of the warm time is loading the flat config (about 1 s), so the cache saves only the rule time. With the `content` strategy a `touch` without a content change re-lints nothing; an edit re-lints only that file.
- Route types under `next dev`: adding `src/app/<route>/page.tsx` updates `.next/dev/types/routes.d.ts` within about 2 s, and `tsc` then accepts `PageProps<"/<route>">` and rejects an unknown route (TS2344). Removing the route removes it from the types again.
- To verify manually (AC-14): in VS Code open `apps/frontend/src/app/page.tsx`, run `pnpm --filter frontend dev`, add a temporary route and check that `PageProps<"/<route>">` autocompletes without a window reload; then open "Developer: Open Process Explorer", save `page.tsx` a few times and run `pnpm --filter frontend build`, and check that the tsserver and ESLint server rows show no sustained CPU while `.next/cache`, `.next/dev/cache`, `.next/server` and `.next/static` are written. Record the peaks in the editor (b) row.

### Package incremental and turbo wiring

- `packages/form-commons` and `packages/types` set `incremental: true` with `tsBuildInfoFile: ./node_modules/.tmp/tsconfig.tsbuildinfo` (gitignored, next to the other workspaces' tsbuildinfo files). A warm `tsc --noEmit` on form-commons skips the check phase: `Total time` 1.01 s vs 2.10 s cold (48%, median of 5 pairs). `@repo/types` has no `typecheck` script; `tsc --noEmit` in `packages/types` passes.
- `turbo.json` follows the transit-node pattern from the bundled turbo docs (`crafting-your-repository/configuring-tasks.mdx`, "Dependent tasks that can be run in parallel"): `typecheck` depends on `^transit`, and `transit` depends on `^transit`. In `turbo run lint typecheck --dry=json` no lint task depends on a lint task and no typecheck task on a typecheck task; `frontend#typecheck` and `cms-admin#typecheck` depend only on `@repo/form-commons#transit`. The docs example uses `dependsOn: ["transit"]` (the package's own transit); `^transit` is used here so a docs-only edit in an app doesn't change the app's own transit hash.
- `lint`, `typecheck` and `transit` use `inputs: ["$TURBO_DEFAULT$", "!**/*.md", "!docs/**"]` (`--dry=json` shows the resolved form without `$TURBO_DEFAULT$`).
- Cache checks: a content edit in `packages/form-commons/src/lib/cn.ts` gives a MISS for `frontend#typecheck` and `cms-admin#typecheck` (HIT again after reverting); an edit to only `apps/cms-admin/docs/README.md` gives `FULL TURBO` for `pnpm turbo run lint typecheck`. Turbo hashes file contents, so a bare `touch` changes nothing.
- AC-16, cms-admin memory: on the day of this phase, cms-admin's program is 1994 files / 620 to 626 MB with both the old and the new package configs (A/B run, 3 each). cms-admin's config doesn't read the package tsconfigs, so the change adds nothing; the rise from the 571 MB baseline is machine drift and is above the baseline plus 5% (600 MB) either way.

### Measuring

- TS program: `(cd <workspace> && ./node_modules/.bin/tsc -p <tsconfig> --noEmit --extendedDiagnostics | grep -E '^(Files|Memory used|Total time)')`
- File list: `(cd <workspace> && ./node_modules/.bin/tsc -p <tsconfig> --listFilesOnly)`
- Typecheck / lint wall time: `(cd <workspace> && /usr/bin/time -p pnpm typecheck)` and `(cd <workspace> && /usr/bin/time -p pnpm lint)`. "Cold" is the first run, "warm" the second run with nothing changed.
- ESLint files linted: `(cd apps/frontend && pnpm lint --debug 2>&1 | grep -c "Linting code for")`
- cms-api build output: `pnpm --filter cms-api build && (cd apps/cms-api/dist && find . -type f -name '*.js' | sort | xargs shasum -a 256)`
- Editor (manual, VS Code "Developer: Open Process Explorer"): open the same four files, one each from `apps/frontend/src`, `apps/cms-api/src`, `packages/form-commons/src` and `apps/cms-admin/src`. Read memory and CPU of the tsserver processes (`tsserver.js` / "TypeScript" rows under the extension host) and the ESLint server row in three cases: (a) idle for 2 minutes, then read; (b) during `pnpm build`, and during `pnpm --filter frontend dev` while saving a frontend file a few times; (c) during `pnpm turbo run lint typecheck --force`. Note the peak value for (b) and (c).

### Before and after

Before = 2026-10-13, after Part B (`@repo/form-commons`), Apple Silicon, Node 24. Memory is tsc's "Memory used" in KB / 1000. "To measure" rows follow the editor steps above.

| Workspace    | Metric                                                            | Before                                                                                                                                               | After                                                                                                                                          |
| ------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| cms-api      | TS program (`tsconfig.json`): files / memory / time               | 801 / 192 MB / 1.6 s                                                                                                                                 | app 639 / 128 MB / 0.45 s; spec 800 / 162 MB / 0.6 s (median of 5, `tsconfig.app.json` / `tsconfig.spec.json`)                                 |
| cms-api      | `typecheck` cold (`--incremental false`) / warm                   | 0.7 s / 1.0 s (warm buildinfo sits in `dist/`, wiped by `nest build`)                                                                                | `tsc -b --noEmit`: 1.1 s (no tsbuildinfo) / 0.35 s, also right after `nest build`                                                              |
| cms-api      | `lint` (oxlint `--type-aware`) cold / warm                        | 0.75 s / 0.42 s, 0 findings                                                                                                                          | 0.45 s warm, 0 findings                                                                                                                        |
| cms-api      | `dist/`                                                           | 13 files (incl. `tsconfig.tsbuildinfo`); `.js` sha256: `app.controller` ddddb06b…, `app.module` e212b5b0…, `app.service` 95e26ee6…, `main` 8778e9a3… | 13 files (incl. `tsconfig.build.tsbuildinfo`); same file list and identical `.js` sha256 after two clean builds                                |
| frontend     | TS program (`tsconfig.json`, TS 5.9.3): files / memory / time     | 1449 / 289 MB / 1.4 s                                                                                                                                | 1449 / 279 MB / 1.0 s warm (Program 0.78 s, no check); `--incremental false`: 1449 / 362 MB / 1.7 s; nothing under `.next/standalone`          |
| frontend     | `typecheck` cold (`--incremental false`) / warm                   | 1.9 s / 1.6 s                                                                                                                                        | no tsbuildinfo 2.4 s / warm 1.6 s (67%, misses the 50% target: `tsc` program build ~0.78 s; split pnpm 0.25 s, typegen 0.25 s, tsc 1.1 s)      |
| frontend     | `lint` (ESLint, no cache) cold / warm; files linted               | 7.8 s / 1.5 s; 6                                                                                                                                     | `--cache --cache-strategy content`: 1.6 s / 1.30 s (median of 9); 0 files warm, 1 after editing `page.tsx`; same findings (0) and print-config |
| cms-admin    | TS program (`tsconfig.app.json`): files / memory / time           | 1994 / 571 MB / 5.5 s                                                                                                                                | config unchanged: 1994 / 623 MB / 4.6 to 5.4 s; same 620 to 626 MB with the pre-2.4 package configs (A/B), so drift, not growth                |
| cms-admin    | `typecheck` (`tsc -b --noEmit`) run 1 / run 2                     | 5.7 s / 5.5 s                                                                                                                                        |                                                                                                                                                |
| cms-admin    | `lint` (oxlint) cold / warm                                       | 0.46 s / 0.33 s                                                                                                                                      |                                                                                                                                                |
| form-commons | TS program (`tsconfig.json`): files / memory / time               | 1307 / 348 MB / 2.1 s                                                                                                                                | `incremental`: cold 1307 / 370 to 380 MB / 2.10 s, warm 1307 / 261 MB / 1.01 s (48%); `--incremental false`: 1307 / 340 to 343 MB              |
| form-commons | `typecheck` run 1 / run 2                                         | 2.3 s / 2.4 s                                                                                                                                        | no tsbuildinfo 2.6 to 3.4 s / warm 1.4 to 1.6 s                                                                                                |
| form-commons | `lint` (oxlint) cold / warm                                       | 0.32 s / 0.34 s                                                                                                                                      |                                                                                                                                                |
| editor       | (a) idle 2 min: tsserver memory / CPU; ESLint server memory / CPU | to measure                                                                                                                                           |                                                                                                                                                |
| editor       | (b) `pnpm build` and `next dev` rebuilds: same four values (peak) | to measure                                                                                                                                           |                                                                                                                                                |
| editor       | (c) CLI `lint typecheck --force`: same four values (peak)         | to measure                                                                                                                                           |                                                                                                                                                |

## Gotchas

- **pnpm 11 argument passing:** pass extra args without `--`: `pnpm --filter frontend dev -p 3001`.
- **pnpm 11 new-release guard:** `minimumReleaseAge` holds back very new releases. `pnpm install` adds exemptions to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` automatically.
- **Peer dependency warning:** `tsconfck` (via cms-api's `vite-tsconfig-paths`) wants TypeScript 5 but gets 6. It's harmless so far.
- **cms-api subpath imports:** cms-api is ESM with `nodenext` resolution, so subpath imports of packages without an `exports` map need the extension, e.g. `supertest/types.js`.
- **zsh tag strings:** in zsh scripts, `"$app:tag"` triggers history modifiers (`:t`, `:l`, `:s`). Write `"${app}:tag"`.
- **Clean-copy lint tests:** a clean copy of the repo placed under the gitignored `out/` makes oxlint and eslint find "no files". Give the copy its own `git init`.
