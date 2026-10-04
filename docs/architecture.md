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
│   ├── ui/                 # @repo/ui: shared React components, form components and Tailwind theme
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

`cms-admin` and `frontend` depend on `@repo/ui` (`workspace:*`), so turbo's change detection rebuilds both when the package changes, and `turbo prune` puts it in their Docker builds. No app depends on `@repo/types` yet.

## Shared UI package (`@repo/ui`)

`packages/ui` holds the shadcn/ui primitives (Base UI flavour), the generic form components (`Field`, `GatedButton`, `Pagination`, …), pure helpers (`cn`, `json`, `pagination`, `Decision`) and the shared Tailwind v4 theme. The admin-specific form components stay in cms-admin.

- **No build step.** The package ships TypeScript source with subpath `exports` (`@repo/ui/components/*`, `@repo/ui/form/*`, `@repo/ui/hooks/*`, `@repo/ui/lib/*`, `@repo/ui/styles/theme.css`, `@repo/ui/styles/tokens`). Vite compiles it in cms-admin, and Next compiles it in frontend through `transpilePackages: ['@repo/ui']`.
- **Theme.** Each app's global CSS imports `@repo/ui/styles/theme.css` and adds `@source '../../../../packages/ui/src'`, so Tailwind generates the package's classes.
- **Client components.** Every `.tsx` module in `src/components` and `src/form` starts with `'use client'`, for Next's App Router.
- **TypeScript 5 and 6.** The package is written under cms-admin's TS 6. `apps/frontend/src/ui-compile-check.ts` re-exports every entry so frontend's TS 5 typechecks it too; add new entries there.
- **Boundaries.** Unit tests in the package fail on imports through `@/`, from `apps/*`, or from app-only libraries (router, axios, Redux, TanStack, react-hook-form), on a missing `'use client'`, and on raw hex or palette classes in any `.tsx` file of the package or cms-admin.
- **Tests.** `pnpm --filter @repo/ui test`, or `test:cov` for the coverage gates (`src/form` at 70%, `src/lib` and `tokens.ts` at 85%; the vendored `src/components` are excluded). The root `pnpm test` runs them too.

See [cms-admin's design system](../apps/cms-admin/docs/design-system.md) for the components, tokens and palette.

## Apps

| App         | Stack                                             | Dev command                       | Dev port | Lint                | Tests                                                 | Container port |
| ----------- | ------------------------------------------------- | --------------------------------- | -------- | ------------------- | ----------------------------------------------------- | -------------- |
| `cms-api`   | NestJS 12, TypeScript 6, ESM                      | `pnpm --filter cms-api start:dev` | 3000     | oxlint (type-aware) | Vitest (`test`, `test:e2e`)                           | 3000           |
| `cms-admin` | Vite 8, React 19, TypeScript 6                    | `pnpm --filter cms-admin dev`     | 5173     | oxlint              | Vitest (`test`, `test:cov`) + Playwright (`test:e2e`) | 8080 (nginx)   |
| `frontend`  | Next.js 16.3 (App Router, Tailwind), TypeScript 5 | `pnpm --filter frontend dev`      | 3000     | ESLint 9            | none                                                  | 3000           |

Each app keeps its generator's own tooling and versions. That's why TypeScript and lint tools differ between apps, and it's intentional. Nest 12 has no `dev` script, so `pnpm dev` at the root doesn't start cms-api.

## Turbo tasks

| Task        | Depends on   | Notes                                                                                                                               |
| ----------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `build`     | `^build`     | outputs `dist/**`, `.next/**` (minus cache)                                                                                         |
| `typecheck` | `^typecheck` | `tsc --noEmit`. cms-admin uses `tsc -b --noEmit`. frontend runs `next typegen` first, because `next-env.d.ts` is gitignored         |
| `lint`      | `^lint`      |                                                                                                                                     |
| `test`      | `^build`     | runs the cms-api, cms-admin and `@repo/ui` unit tests (Vitest). e2e suites (`test:e2e`) and coverage (`test:cov`) run per workspace |
| `dev`       | —            | persistent, not cached                                                                                                              |

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

## Gotchas

- **pnpm 11 argument passing:** pass extra args without `--`: `pnpm --filter frontend dev -p 3001`.
- **pnpm 11 new-release guard:** `minimumReleaseAge` holds back very new releases. `pnpm install` adds exemptions to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` automatically.
- **Peer dependency warning:** `tsconfck` (via cms-api's `vite-tsconfig-paths`) wants TypeScript 5 but gets 6. It's harmless so far.
- **cms-api subpath imports:** cms-api is ESM with `nodenext` resolution, so subpath imports of packages without an `exports` map need the extension, e.g. `supertest/types.js`.
- **zsh tag strings:** in zsh scripts, `"$app:tag"` triggers history modifiers (`:t`, `:l`, `:s`). Write `"${app}:tag"`.
- **Clean-copy lint tests:** a clean copy of the repo placed under the gitignored `out/` makes oxlint and eslint find "no files". Give the copy its own `git init`.
