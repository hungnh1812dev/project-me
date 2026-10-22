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
- apps/cms-admin, apps/web: React 19, Vite 8, Tailwind v4, Vitest
- packages/form-commons: React component library (tsup + Tailwind CLI, shadcn/Radix), Vitest
- Monorepo: pnpm 11 workspaces + turbo, Node >= 24, TypeScript 6
Commands:
- install: `pnpm install`
- build: `pnpm build` (one package: `pnpm --filter <name> build`)
- type-check: `pnpm typecheck`
- lint: `pnpm lint`
- unit test: `pnpm --filter <name> test` (all: `pnpm test`; cms-api: `test:unit`, `test:integration`)
- format: `pnpm exec prettier --write <files>` (check: `pnpm format:check`)
- e2e: `SMOKE_E2E=1 pnpm smoke` (first time: `pnpm --filter @abyss/e2e browsers:install`)
- e2e single spec (against a kept stack, no rebuild): `pnpm e2e:spec <spec relative to apps/e2e> [-g <test name>]`; needs a stack from `SMOKE_KEEP=1 SMOKE_E2E=1 pnpm smoke`. `SMOKE_NO_BUILD=1` reuses the last built images (only when no product code changed).
- run app: dev `pnpm --filter @abyss/cms-admin dev` (5173), `pnpm --filter @abyss/web dev` (5174); full stack for browser checks `SMOKE_KEEP=1 pnpm smoke` (teardown `docker compose -p abyss-smoke down -v`)
- dependency audit: `pnpm audit`
E2E tests: `apps/e2e` (Playwright, Chromium)
Docs to keep current: each app/package `README.md`, `docs/modules/*.md`, ADRs in `docs/adr/`, each app's `.env.example`
Security rules: `SPEC.md` §7 (Security Decisions), `docs/modules/access-control.md`
