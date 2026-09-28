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
│   ├── ui/                 # @repo/ui: shared React components (empty for now)
│   ├── eslint-config/      # @repo/eslint-config: base flat config
│   └── typescript-config/  # @repo/typescript-config: base tsconfig
├── .github/workflows/ci.yml  # CI/CD pipeline, see ci-cd.md
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

No app depends on a `@repo/*` package yet. When one does, turbo's change detection will automatically rebuild that app when the package changes.

## Apps

| App | Stack | Dev command | Dev port | Lint | Tests | Container port |
|---|---|---|---|---|---|---|
| `cms-api` | NestJS 12, TypeScript 6, ESM | `pnpm --filter cms-api start:dev` | 3000 | oxlint (type-aware) | Vitest (`test`, `test:e2e`) | 3000 |
| `cms-admin` | Vite 8, React 19, TypeScript 6 | `pnpm --filter cms-admin dev` | 5173 | oxlint | none | 80 (nginx) |
| `frontend` | Next.js 16.3 (App Router, Tailwind), TypeScript 5 | `pnpm --filter frontend dev` | 3000 | ESLint 9 | none | 3000 |

Each app keeps its generator's own tooling and versions. That's why TypeScript and lint tools differ between apps, and it's intentional. Nest 12 has no `dev` script, so `pnpm dev` at the root doesn't start cms-api.

## Turbo tasks

| Task | Depends on | Notes |
|---|---|---|
| `build` | `^build` | outputs `dist/**`, `.next/**` (minus cache) |
| `typecheck` | `^typecheck` | `tsc --noEmit`. cms-admin uses `tsc -b --noEmit`. frontend runs `next typegen` first, because `next-env.d.ts` is gitignored |
| `lint` | `^lint` | |
| `test` | `^build` | only cms-api has tests |
| `dev` | — | persistent, not cached |

Before changing `turbo.json`, read the docs bundled with the installed turbo (`node_modules/turbo/docs/`). See the root `AGENTS.md`.

## Docker images

Every Dockerfile builds from the **repo root** (`docker build -f apps/<app>/Dockerfile .`) and isolates its app with `turbo prune <app> --docker`, so the image only contains that app and its workspace dependencies.

| App | Stages | Runtime | Size (unpacked / compressed) |
|---|---|---|---|
| `cms-api` | prepare (prune) → manifests → prod-deps / builder → runner | `node:24-alpine`, non-root `node` user, `node dist/main` | ~200MB / 64MB |
| `cms-admin` | prepare → builder → runner | `nginx:alpine`: SPA fallback to `index.html`, long cache for `/assets/` | ~93MB |
| `frontend` | prepare → builder → runner | `node:24-alpine`, Next `output: 'standalone'`, `node apps/frontend/server.js` | ~217MB / 75MB |

About 176MB of each Node image is the `node:24-alpine` base.

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
