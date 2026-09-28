# Spec: Monorepo Scaffold (Turborepo + pnpm)

Source: [monorepo_structure_documentation.md](monorepo_structure_documentation.md). This spec covers **only** the first step: the empty skeleton. Docker, nginx and business code come later, each with its own spec.

## Objective

Create a pnpm + Turborepo monorepo in the current repo root that holds 3 freshly generated apps and 4 empty shared packages, all at their latest versions. The generator output stays as it is. We only add the wiring the workspace needs to install, build and lint from the root.

**Who it's for:** the developer(s) who will start building `cms-api`, `cms-admin` and `frontend` on top of it.

**Decisions made (2026-09-28):**
| # | Decision | Deviation from doc? |
|---|---|---|
| D1 | Scope is the scaffold plus workspace wiring. Dockerfiles and `nginx.conf` were added afterwards at the user's request (see Implementation Notes, Docker). | — |
| D2 | We write the root files by hand. Each app comes from its official CLI, not the `create-turbo` template. | — |
| D3 | Target **Node 24 LTS**, not Node 20, which reached EOL in April 2026. | Yes |
| D4 | The repo root is the monorepo root. There is no `my-monorepo/` subfolder. | Yes |
| D5 | `packages/types` uses `src/index.ts` instead of `index.ts` at the package root, following the common convention. | Minor |
| D6 | Next.js config is whatever `create-next-app` generates (`next.config.ts`), not `next.config.js`. | Minor |
| D7 | `frontend` uses Next's **`output: 'standalone'`** with `outputFileTracingRoot` = monorepo root (required so pnpm's root `node_modules` is traced). A custom server (`server.ts`) was tried first and then dropped: standalone can't be combined with it, and without standalone the image was ~570MB unpacked (full `next` + `@next/swc` in node_modules). Scripts are the generated `next dev` / `next build` / `next start`. | Matches doc |

## Tech Stack (latest on npm as of 2026-09-28)

| Tool | Version | Used by |
|---|---|---|
| Node.js | 24.x LTS (local 24.18.0) | all |
| pnpm | 11.x (local 11.5.2), pinned via `packageManager` | root |
| turbo | 2.11.x | root |
| NestJS (`@nestjs/cli` 12.0.x, core 12.1.x) | via `nest new` | `apps/cms-api` |
| Vite 8 + React 19 + TS (`create-vite` 9.2.x, template `react-ts`) | via `create-vite` | `apps/cms-admin` |
| Next.js 16.3.x (App Router, TS, Tailwind, ESLint, `src/`) | via `create-next-app` | `apps/frontend` |

The generators choose their own versions of TypeScript, ESLint, React and similar dependencies. We do not override them. See the open question about TS 7.

## Commands

```bash
# Generation (run once, from repo root)
pnpm dlx @nestjs/cli@latest new cms-api --directory apps/cms-api --package-manager pnpm --skip-git --skip-install --strict --no-observe
pnpm create vite@latest apps/cms-admin --template react-ts --no-interactive --no-immediate
pnpm create next-app@latest apps/frontend --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-pnpm --skip-install --disable-git --yes

# Day-to-day (from repo root)
pnpm install                     # install all workspaces
pnpm build                       # turbo run build
pnpm dev                         # turbo run dev
pnpm lint                        # turbo run lint
pnpm test                        # turbo run test
pnpm --filter cms-api start:dev  # run one app (Nest 12 has no `dev` script)
pnpm turbo prune cms-api --docker   # isolation check (output to ./out, not committed)

# Docker (build from the repo root; each Dockerfile runs `turbo prune` itself)
docker build -f apps/cms-api/Dockerfile   -t cms-api:<tag>   .
docker build -f apps/cms-admin/Dockerfile -t cms-admin:<tag> .
docker build -f apps/frontend/Dockerfile  -t frontend:<tag>  .
docker run -p 3000:3000 cms-api:<tag>     # cms-admin listens on 80, frontend on 3000
```

If a CLI flag has changed in the latest version, use the nearest non-interactive equivalent and record the change in this spec.

## Project Structure

```text
.
├── apps/
│   ├── cms-api/            # NestJS, untouched `nest new` output
│   ├── cms-admin/          # Vite react-ts, untouched `create-vite` output
│   └── frontend/           # Next.js, untouched `create-next-app` output
├── packages/
│   ├── types/              # @repo/types: package.json, tsconfig.json, src/index.ts (empty export)
│   ├── ui/                 # @repo/ui: package.json, tsconfig.json, src/index.ts (empty export)
│   ├── eslint-config/      # @repo/eslint-config: package.json + base flat config
│   └── typescript-config/  # @repo/typescript-config: package.json + base.json
├── package.json            # private root; scripts -> turbo; devDeps: turbo; packageManager: pnpm@11.x
├── pnpm-workspace.yaml     # apps/*, packages/* (+ build-script allowlist if pnpm 11 requires one)
├── turbo.json              # tasks: build, dev (persistent, no cache), lint, test
├── .gitignore              # node_modules, dist, .next, .turbo, out, coverage
├── .nvmrc                  # 24
├── README.md               # existing file, left unchanged
├── monorepo_structure_documentation.md
└── SPEC.md
```

**Allowed edits to generator output (the "wiring"):**
- Remove lockfiles or nested `.git` directories that a generator creates inside an app. The root `pnpm-lock.yaml` is the only lockfile.
- Rename an app's `package.json` `name` only if it doesn't already match its folder (`cms-api`, `cms-admin`, `frontend`). `turbo prune` depends on the name.

Anything else inside `apps/*` is out of scope. That includes extending the shared tsconfig or eslint config and adding `@repo/*` dependencies. Those belong to a later spec.

## Code Style

Each app keeps its generator's style: Nest 12's Prettier + **oxlint** setup (not ESLint), and the default ESLint flat configs from Vite and Next. The shared packages are minimal:

```jsonc
// packages/types/package.json
{
  "name": "@repo/types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

```ts
// packages/types/src/index.ts
export {};
```

Conventions: shared packages use the `@repo/*` scope, apps have unscoped names, all packages are `private: true`, and internal dependencies use `workspace:*`.

## Testing Strategy

There is no application code, so we write no new tests. We only verify that the scaffold works (see Success Criteria):
- The Nest-generated tests must still pass via `pnpm test`. Nest 12 uses **Vitest** (unit tests) and a separate `test:e2e` config, not Jest.
- Vite and Next have no test runner by default. We don't add one.

## Boundaries

- **Always:** use the official generators with `@latest`. Keep a single root lockfile. Run `pnpm install && pnpm build && pnpm lint` before calling it done.
- **Ask first:** deleting any file, adding a dependency the generators didn't add (e.g. zod, Radix, Tailwind in `@repo/ui`), any edit inside `apps/*` beyond the allowed wiring, and committing.
- **Never:** create or touch `.env*` files other than `.env.example`, write outside the project directory, commit `node_modules`, `out/` or build output, or add Dockerfiles or nginx config in this step.

## Success Criteria

1. The tree matches **Project Structure**, and `apps/*` contains no extra lockfiles or `.git` directories.
2. `pnpm install` at the root succeeds and produces one `pnpm-lock.yaml`.
3. `pnpm build` succeeds for all 3 apps (packages have no build step, or a no-op one).
4. `pnpm lint` exits 0.
5. `pnpm test` passes, which covers Nest's generated specs.
6. Each app's dev script starts it (`start:dev` for cms-api, `dev` for the others): Nest on :3000, Vite on :5173, Next on :3000 (run it on its own or with `-p 3001`).
7. `pnpm turbo prune cms-api --docker` produces `out/` containing only `cms-api` and its dependencies. Delete `out/` afterwards.
8. Each app's `package.json` shows the latest major versions listed in Tech Stack.

## Implementation Notes

- **T3 (2026-09-28):** `nest new` v12 added an `--observe` prompt, so we pass `--no-observe`. It generated Vitest + oxlint + TypeScript 6.0 (not Jest/ESLint/TS 7). There is no `dev` script, so `turbo run dev` skips cms-api until a later spec adds one.
- **T4 (2026-09-28):** `create-vite` 9 defaults to **oxlint** for React templates (`--eslint` opts out), and we kept the default so linting matches cms-api. It generated TypeScript ~6.0 and React ^19.2.8 (the caret range resolves to 19.3.x). The template ships its own `.gitignore`, and we kept it.
- **T5 (2026-09-28):** `create-next-app` 16.3 removed `--turbopack` (Turbopack is the default). It generated `AGENTS.md` + `CLAUDE.md` (kept), a `packageManager` field (kept), and a **nested `apps/frontend/pnpm-workspace.yaml`** containing `allowBuilds: {sharp: false, unrs-resolver: false}` (moved its `allowBuilds` block to the root file and deleted the nested one, per user decision). It pins older tooling than the other apps: TypeScript ^5, ESLint ^9, @types/node ^20, and exact React 19.2.8.
- **T6 (2026-09-28):** All success criteria were verified. Findings: (a) `turbo` 2.11 writes a root `AGENTS.md` block when it detects an AI agent (kept; set `"agentGuidance": false` in turbo.json to opt out). (b) `turbo.json` `test` no longer declares `coverage/**` outputs, since plain `vitest run` doesn't produce them. (c) There is a peer warning: `tsconfck` (via cms-api's `vite-tsconfig-paths`) wants TypeScript ^5 but gets 6.0.3. It's harmless so far, and Vitest suggests replacing the plugin with native `resolve.tsconfigPaths`. (d) With pnpm 11, pass extra args without `--`: `pnpm --filter frontend dev -p 3001`.
- **Docker (2026-09-28):** The Dockerfiles follow turbo's bundled Docker guide: a `prepare` stage runs `turbo prune <app> --docker`, then `builder` runs `pnpm install --frozen-lockfile` (with a BuildKit store cache) and `turbo run build`, then `runner`. Base images are `node:24-alpine` and `nginx:alpine`. Node runners use the non-root `node` user. `cms-api` gets production-only deps via `pnpm deploy --legacy --prod` in a separate `prod-deps` stage (plain `pnpm deploy` would require `injectWorkspacePackages: true` workspace-wide, which breaks live linking of `@repo/*` in local dev). `cms-admin` nginx: SPA fallback to `index.html`, long-cache for `/assets/`. The root `.dockerignore` excludes node_modules, build output, `.git` and `.env*`. Verified: all 3 containers return HTTP 200. `frontend` runner copies `.next/standalone`, `.next/static` and `public`, sets `HOSTNAME=0.0.0.0`, and runs `node apps/frontend/server.js`. Sizes (Docker 29 reports compressed + unpacked together; unpacked / compressed download in brackets): cms-api 264MB (~200MB / 64MB), cms-admin 93MB, frontend 292MB (~217MB / 75MB). About 176MB of each Node image is the `node:24-alpine` base.
- **Docker layer caching (2026-09-28):** Verified by rebuilding after edits:
  - A change in another app reuses every cached layer; only `turbo prune` (~0.1s) re-runs.
  - An own-source change reuses `pnpm install`, production deps and the runner's `node_modules` layer. Only the build and the app-code layer re-run.
  - How: `cms-api` uses a `manifests` → `prod-deps` / `builder` split, and the `frontend` runner copies `.next/standalone/node_modules` in its own layer before app code.
  - BuildKit cache mounts cover the pnpm store, turbo's cache (`/app/.turbo/cache`) and Next's Turbopack build cache (`apps/frontend/.next/cache`). The Next cache cut compile time from 3.4s to 0.26s.
  - **CI caveat:** cache mounts and layer cache are local to the builder. CI runners need `docker buildx build --cache-from/--cache-to` (e.g. `type=registry,ref=<registry>/<app>:buildcache,mode=max` or `type=gha`) to reuse layers. Cache mounts are not exported that way. This belongs with the future CI spec.
  - Beware in zsh scripts: `"$app:local"` / `"$app:scaffold"` trigger zsh modifiers (`:l`, `:s`), so write `"${app}:tag"`.

## Open Questions

1. **TypeScript 7 (native) is `latest`.** Nest, Vite and Next may still pin TS 5.x or 6.x. Default: each generator keeps its own pin, and the shared packages match the most common version. Is that OK, or should we standardize now?
2. **zod in `@repo/types`, Tailwind/Radix in `@repo/ui`:** the doc mentions them. Default: don't install them yet, because the packages stay empty.
3. **Commit:** should I commit the scaffold on `develop` when done, or leave it uncommitted for your review?
