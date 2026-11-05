# Project Profile
Tasks: `tasks/todo.md` (open tasks only) - grep `**<ID>:` and read that entry (Acceptance, Verify, Files, Deps, SPEC § refs). Finished tasks: `tasks/done.md` (requirement + result).
Phases: `tasks/plan.md` (features in build order, their open phases and checkpoint tables)
Spec: root `SPEC.md` (index and Docs table); flows `docs/flows/<flow>/`, apps `docs/apps/<app>/`, global `docs/global/`. Layout and where a change goes: root `CLAUDE.md` "Spec layout" (already in your context).
Scopes:
- core-builder: `apps/cms-api`, `packages/base-config`, `.github/`, `turbo.json`, `docker-compose.smoke.yml`, `scripts/`, `docs/deployments/`, `.claude/skills/release-tag/`, `docs/apps/*/patch-*.md`, `CHANGELOG.md` (the template at `.github_template/` is reference only; do not edit it)
- ui-builder: `apps/cms-admin`, `apps/web`, `packages/form-commons`
- qc: `apps/e2e`
High-risk paths: `apps/cms-api/src/modules/identity`, `apps/cms-api/src/modules/access`, `apps/cms-api/src/modules/reviewer`, `apps/cms-api/src/modules/media`, `apps/cms-admin/src/features/auth`, `apps/cms-admin/src/features/security`, `apps/web/src/features/auth`
Stack:
- apps/cms-api: NestJS 11, Prisma 7, Kysely 0.28, PostgreSQL 17, Jest (unit + integration via Testcontainers; Docker must be running)
- apps/cms-admin: React 19, Vite 8, Tailwind v4, Vitest
- apps/web: Next.js 16 (App Router), React 19
- packages/form-commons: React component library (tsup + Tailwind CLI, shadcn/Radix), Vitest
- Monorepo: pnpm 11 workspaces + turbo, Node >= 24, TypeScript 6
Commands:
- install: `pnpm install`
- build: `pnpm build` (one package: `pnpm --filter <name> build`)
- type-check: `pnpm typecheck`
- lint: `pnpm lint`
- unit test: `pnpm --filter <name> test` (all: `pnpm test`; cms-api: `test:unit`)
- integration test: cms-api `pnpm --filter @abyss/cms-api test:integration` (Testcontainers, Docker must run)
- format: `pnpm exec prettier --write <files>` (check: `pnpm format:check`)
- dev stack (tier 2): `pnpm dev:stack` (stop `pnpm dev:stack:stop`; compose project `abyss-dev`, env from `.localEnv.agent`, vars in `.dev-stack/e2e-vars.sh`); run specs with `E2E_STACK=dev pnpm e2e:spec ...`
- full stack (tier 3): `SMOKE_E2E=1 pnpm smoke`; kept mode `SMOKE_KEEP=1 SMOKE_E2E=1 pnpm smoke`; `SMOKE_NO_BUILD=1` reuses the last built images (only when no product code changed); stop `docker compose -p abyss-smoke down -v`; serves port 8080
- e2e single spec: `pnpm e2e:spec <spec relative to apps/e2e> [-g <test name>]` against a running stack (first time: `pnpm --filter @abyss/e2e browsers:install`)
- run app: dev `pnpm --filter @abyss/cms-admin dev` (5173), `pnpm --filter @abyss/web dev` (5174)
- dependency audit: `pnpm audit`
- module docs: `.claude/bin/module-index` (regenerate file tables and `docs/modules/MODULES.md`), `--check`, `--new <module folder>`; module roots in `docs/modules/module-roots.txt`
Tier 3 also when: `docker-compose.smoke.yml`, `scripts/stack/`, `scripts/smoke*`, any `apps/*/Dockerfile`, the cms-api env schema (`apps/cms-api/src/config/`), Traefik routing, the `deploy:migrate` / `content:migrate` CLIs
E2E tests: `apps/e2e` (Playwright, Chromium)
Docs to keep current: each app/package `README.md`, the module docs in `docs/modules/` (and the generated index `docs/modules/MODULES.md`), the flow docs in `docs/flows/` (the root `SPEC.md` tables are generated), ADRs in `docs/adr/`, each app's `.env.example`; `CHANGELOG.md` (each closed feature adds its items under `## Unreleased`; versions per `docs/global/FLOW.md` "Versions and change log"); a change that needs the deploy repo to change updates `docs/deployments/` and adds `patch-<app|flow|module>-<repo version>.md` in that doc folder
Security rules: `docs/global/RULES.md`, the app's and the flow's `RULES.md`; decisions behind them: `docs/global/DECISIONS.md` (index of every D id); `docs/modules/access-control.md`
Naming: `docs/global/RULES.md` "Naming" (vocabulary: `docs/global/reference/project-structure.md`) (word vocabulary, word required in cms-api and apps/e2e, framework names, test suffixes) and `docs/adr/0008-file-naming-rule.md`; checked by `pnpm lint` (`abyss/file-names`; the per-package `FileNames.architecture.*` guards stay until the FN-lint tasks land)
