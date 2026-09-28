# hungnhdev

Personal website, a pnpm + Turborepo monorepo:

| App | What | Stack |
|---|---|---|
| [`apps/frontend`](apps/frontend) | Public site + BFF | Next.js 16 |
| [`apps/cms-admin`](apps/cms-admin) | Admin portal | React 19 + Vite 8, served by nginx |
| [`apps/cms-api`](apps/cms-api) | Backend API | NestJS 12 |

Shared code lives in [`packages/`](packages) (`@repo/types`, `@repo/ui`, `@repo/eslint-config`, `@repo/typescript-config`).

## Requirements

- Node.js 24 (`.nvmrc`)
- pnpm 11 (pinned via `packageManager`; `corepack enable` picks it up)
- Docker, for building images

## Getting started

```bash
pnpm install
pnpm dev                          # frontend (:3000) and cms-admin (:5173)
pnpm --filter cms-api start:dev   # cms-api (:3000); run frontend with -p 3001 alongside it
```

## Common commands

All run from the repo root through Turborepo:

```bash
pnpm build                           # build all apps
pnpm lint                            # lint all apps
pnpm turbo run typecheck             # typecheck all apps
pnpm test                            # cms-api unit tests
pnpm --filter cms-api test:e2e       # cms-api e2e tests
pnpm turbo run build --filter=frontend   # one app only
```

## Docker

Build from the repo root. Each Dockerfile isolates its app with `turbo prune`.

```bash
docker build -f apps/cms-api/Dockerfile   -t cms-api .     # listens on 3000
docker build -f apps/cms-admin/Dockerfile -t cms-admin .   # listens on 80
docker build -f apps/frontend/Dockerfile  -t frontend .    # listens on 3000
```

## CI/CD

GitHub Actions checks and builds every PR and every push to `develop`, `staging` and `main`, only for the apps that changed. On `staging` (arm64) and `main` (amd64), it also pushes images to GHCR and bumps `APP_IMAGE_TAG` in the deployment repo.

## Docs

- [docs/architecture.md](docs/architecture.md): repo layout, apps, turbo tasks, Docker images, gotchas
- [docs/ci-cd.md](docs/ci-cd.md): the pipeline, branch → environment mapping, one-time GitHub setup, troubleshooting
