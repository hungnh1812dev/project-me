# Project Profile
Tasks: `tasks/todo.md` - grep `**<ID>:` and read that entry (Acceptance, Verify, Files, Deps, SPEC § refs). Index and dependency graph: `tasks/plan.md`.
Phases: `tasks/plan.md` (phase goal/inputs/outputs/exit criteria; older phases may predate this format)
Spec: `SPEC.md` - read only the § the task cites.
Scopes:
- core-builder: `apps/cms-api`, `packages/base-config`, `.github/`, `turbo.json`, `docker-compose.smoke.yml`, `scripts/`, `docs/ci-cd.md` (the template at `.github_template/` is reference only; do not edit it)
- ui-builder: `apps/cms-admin`, `apps/web`, `packages/form-commons`
- qc: `apps/e2e`
High-risk paths: `apps/cms-api/src/modules/identity`, `apps/cms-api/src/modules/access`, `apps/cms-api/src/modules/reviewer`, `apps/cms-api/src/modules/media`, `apps/cms-api/src/infrastructure/media`, `apps/cms-api/src/infrastructure/turnstile`, `apps/cms-admin/src/features/auth`, `apps/cms-admin/src/features/security`, `apps/web/src/features/auth`
Stack:
- apps/cms-api: NestJS 11, Prisma 7, Kysely 0.28, PostgreSQL 16, Jest (unit + integration via Testcontainers; Docker must be running)
- apps/cms-admin: React 19, Vite 8, Tailwind v4, Vitest
- apps/web: Next.js 16 (App Router), React 19
- packages/form-commons: React component library (tsup + Tailwind CLI, shadcn/Radix), Vitest
- Monorepo: pnpm 11 workspaces + turbo, Node >= 24, TypeScript 6
Commands:
- install: `pnpm install`
- build: `pnpm build` (one package: `pnpm --filter <name> build`)
- type-check: `pnpm typecheck`
- lint: `pnpm lint`
- unit test: `pnpm --filter <name> test` (all: `pnpm test`; cms-api: `test:unit`, `test:integration`)
- format: `pnpm exec prettier --write <files>` (check: `pnpm format:check`)
- e2e: by test tier, see "Test tiers" below (first time: `pnpm --filter @abyss/e2e browsers:install`)
- e2e single spec: `pnpm e2e:spec <spec relative to apps/e2e> [-g <test name>]`, against a running dev stack (tier 2) or kept smoke stack (tier 3).
- smoke (tier 3 only): `SMOKE_E2E=1 pnpm smoke`; kept stack `SMOKE_KEEP=1 SMOKE_E2E=1 pnpm smoke`; `SMOKE_NO_BUILD=1` reuses the last built images (only when no product code changed).
- run app: dev `pnpm --filter @abyss/cms-admin dev` (5173), `pnpm --filter @abyss/web dev` (5174); browser checks on the dev stack (tier 2), or on the full stack `SMOKE_KEEP=1 pnpm smoke` only for tier 3 (teardown `docker compose -p abyss-smoke down -v`)
- dependency audit: `pnpm audit`
E2E tests: `apps/e2e` (Playwright, Chromium)

Test tiers (user decision 2026-10-25). The builder sets the tier in `Checks needed`; qc and security-qc run that tier and may raise it, never lower it.
- **Tier 1: unit + integration** (`test:unit`, `test:integration` with Testcontainers). Every task. Enough on its own for a behavior-preserving backend change (refactor, moves) with no UI or flow change.
- **Tier 2: e2e on the dev stack.** Postgres and Mailpit from ready images (no build), cms-api / cms-admin / web in dev mode, then `pnpm e2e:spec`. For tasks that change a user flow, a page or an API response. Command: `pnpm dev:stack` (not built yet, task pending; until it exists, tier 2 runs on a kept smoke stack as before).
- **Tier 3: smoke (+ e2e).** Only when the task touches what dev mode cannot show: Dockerfiles, `docker-compose.smoke.yml`, `scripts/stack/`, the env schema or config, proxy routing, CORS, cookies, security headers or CSP, sessions across apps, the deploy / migrate CLIs, or behavior that exists only with `NODE_ENV=production`. Also once per phase (qc `REGRESSION`, security-qc `PHASE`).
- Agent-local env: dev servers and scripts started by agents read `.localEnv.agent` at the repo root (gitignored and dockerignored, never committed). Agents may create, read and edit it. Dev-only throwaway values only; real secrets and production values still come from the user. `.env*` files stay off limits.
Docs to keep current: each app/package `README.md`, `docs/modules/*.md`, ADRs in `docs/adr/`, each app's `.env.example`
Security rules: `SPEC.md` §7 (Security Decisions), `docs/modules/access-control.md`
