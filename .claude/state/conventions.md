# Conventions (read on demand)

Cross-cutting facts only. Do NOT read this whole file at start: grep the section you need (e.g. `grep -n -A3 -i prisma .claude/state/conventions.md`).
Module structure and API details: the module's README / `docs/modules/*.md`. Per-task history (T01-T34): grep `.claude/state/archive/conventions-archive.md` by task ID or area.

## Tooling
- Node 24.18 (`.nvmrc` = 24), pnpm 11.5.2, turbo 2.11.9. Root: `pnpm build|test|lint|typecheck` (turbo), `pnpm format` / `format:check`.
- TypeScript 6.0.3 per project (ADR 0001). NestJS pinned 11.2.7. Prisma 7.10.1 pinned (ignore the 8.0 rc). Kysely pinned 0.28.x (0.29+ is ESM-only and breaks the CJS build/ts-jest). graphql pinned 17.0.2.
- pnpm 11 minimumReleaseAge (1 day): pin versions released more than 1 day ago, else it writes `minimumReleaseAgeExclude` into pnpm-workspace.yaml. Stale lock entries: `pnpm clean --lockfile && pnpm install`. Lockfile is root pnpm-lock.yaml.
- `allowBuilds` in pnpm-workspace.yaml: install scripts default off; add new ones explicitly (`@prisma/engines`/`prisma` true, `argon2`/`esbuild` false).
- Per-project tooling: own tsconfig extending `../../tsconfig.base.json`, `eslint.config.mjs` and `oxlint.config.ts` from `@abyss/base-config` (base + local extend, D2; until D2 lands: `.oxlintrc.json`), `.prettierrc.cjs` from `@abyss/base-config` (until D2: `@abyss/prettier-config`), `lint` = `oxlint && eslint .`, exact-pinned devDeps; add the folder to `abyss.code-workspace`. tsconfig.base has `declaration: true`: set false in noEmit projects.
- Oxlint (1.88): only one of `.oxlintrc.json` / `oxlint.config.ts` per directory; `extends: [baseOxlint]` does not carry `plugins`, so set them per project; `oxlint.config.ts` is ignored by ESLint (base ignore). Config TS files load via Node type stripping (workspace symlink, not node_modules).
- `.prettierignore` skips `.claude/`, `SPEC.md`, `tasks/`, `CMS_*.html`, lockfile, `.next/`, `next-env.d.ts`. Leave `scripts/*.sh` out of prettier (no parser).
- a11y lint runs via oxlint `jsx-a11y` (eslint-plugin-jsx-a11y does not support ESLint 10). oxlint forbids conditional expect; prefers `<output>` over `role="status"`; copy keys must not start with `use` (react-hooks false positive).

## Testing & smoke
- cms-api Jest projects `unit` (src/**/*.spec.ts) + `integration` (test/integration, Testcontainers `postgres:16-alpine`, Docker must run). Jest needs `NODE_OPTIONS=--experimental-vm-modules` (set in scripts). Full parallel run can time out Testcontainers: use `--maxWorkers=2`; a single "ports not bound in 30 s" timeout: rerun before debugging.
- `createTestApp(env, overrides, testModules)` in `test/fixtures/test-app.ts` shares the real pipeline; `Clock` is the only time source (tests spyOn `app.get(Clock).now`). Test DB env: `dbEnvOf(url)` / `TEST_DB_ENV` in test/fixtures/env.fixture.ts.
- In Jest, fs errors and plain objects from other realms fail `instanceof` / plain-object checks: check structurally (`error.code`).
- eslint flags `expect.stringContaining` inside object literals (unsafe any): wrap in a helper returning `unknown`.
- Frontend tests: Vitest + jsdom, `src/**/*.test.tsx`; jsdom needs the ResizeObserver stub and the `<dialog>` polyfill (test/setup.ts); ProseMirror is driven through `element.editor`. form-commons must be rebuilt (`pnpm --filter @abyss/form-commons build`) before apps see new exports.
- `pnpm smoke` = scripts/smoke.sh (compose project `abyss-smoke`, port 8080, `SMOKE_KEEP=1` keeps the stack for browser checks; teardown `docker compose -p abyss-smoke down -v`). New cms-api env keys go into docker-compose.smoke.yml `cms-api.environment` (secrets generated in smoke.sh as SMOKE_*); new assertions use `request`/`expect_status`/`expect_header`.
- Iterate e2e with `pnpm e2e:spec <spec>` against a kept stack (`SMOKE_KEEP=1` writes the gitignored `.smoke/e2e-vars.sh`); full `SMOKE_E2E=1 pnpm smoke` only to start and to finish. Specs share the stack's data and rate-limit counters between runs.
- e2e: `apps/e2e` (Playwright, Chromium in node_modules via `browsers:install`), run with `SMOKE_E2E=1 pnpm smoke`; `workers: 1`. Rate-limit budget: owner login 4 of 5 per 15 min, request-otp 4 of 5 per IP across smoke + e2e: keep new specs within it. Seeded accounts: e2e-2fa, reader guests (E2E_READER_*, E2E_READER_2FA_*). Mailpit at mail.<SMOKE_DOMAIN>.
- Manual DevTools checks on a kept smoke stack: the owner password is never printed; set a known one (argon2 hash via `node -e` in the cms-api container, psql update in the db container) - only in the abyss-smoke stack.
- Component preview without an app: render with react-dom/server into scratchpad HTML + dist/styles.css, open via chrome-devtools MCP.
- CI e2e: `bash scripts/e2e-stack.sh` (docker run stack, no compose; docs/ci-cd.md). Seeding and E2E_* export are shared with smoke in `scripts/lib/stack-seed.sh`; static cms-api env is `scripts/stack/cms-api.env` (add new static cms-api settings there, not in the compose file). Lint workflows: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest`.

## Frontend
- cms-admin: `src/config/env.ts` is the only reader of `import.meta.env`; apps/web: `env.client.ts` reads literal `process.env.NEXT_PUBLIC_*` only, `env.server.ts` (`server-only`) validated at start by `instrumentation.ts`.
- All API paths in `src/config/endpoints.ts`; never send trailing slashes; copy in `src/config/copy.constants.ts` (no i18n yet); route paths in `src/config/routes.ts`.
- form-commons: tokens in `src/styles/tokens.css` (semantic shadcn names), shadcn via `pnpm --filter @abyss/form-commons exec shadcn add <x>`, pin exactly and restyle to semantic tokens. Dialogs = Radix `Dialog*` (footer `DialogClose` Cancel). `Button` has no default type: give non-submit buttons in forms `type="button"`. Router links: `<Button asChild variant="link">`.
- Admin tests use fake handlers keyed "METHOD /path" (`test/fake-api.ts`, createTestServices).
- apps/web `proxy.ts` `config.matcher` must be an inline static literal (Next rejects an imported constant); `next.config.ts` imports must stay import-free files (`security-headers.constants.ts`). cms-admin nginx headers come from `nginx/security-headers.inc.template` (envsubst, `CSP_CONNECT_SRC`); new nginx locations must include `security-headers.inc` (add_header is not inherited).
- Local `next build` of apps/web needs `NEXT_PUBLIC_API_BASE_URL` in the shell (agents never read .env.local).

- form-commons table parts (`SortableSheet`, `TablePagination`, `BulkActionBar`) take all copy via `labels`; column renderers are named `renderCell` (oxlint no-unstable-nested-components flags `cell:`). Admin list copy is `COPY.content.collection` / `COPY.content.bulk`.

## Backend (cms-api)
- Errors: throw HttpException with `{ errorCode, message }`; the filter passes `details` for 4xx. Constants in `src/common/constants/*.constants.ts`; config via `APP_CONFIG` (src/config).
- Express Request typing: use `RequestWithId` from request-id.middleware (module augmentation fails under pnpm strict).
- Content SQL names come only from `naming.ts` `planTables()`. Content reads go through `ContentDbProvider.db` (Kysely); controllers and DTOs must not import content.repository/tree-loader (architecture tests).
- Every record body goes through `RecordSerializer` with `recordReadAccess(actor, fieldsFor().readable)`; writes: strip `version`, then `WriteAllowlist.apply`, then `assertTreeInput`. Rules: docs/modules/access-control.md.
- Token-accepting content routes: `@UseGuards(ApiTokenGuard, PermissionGuard)` (module imports AccessModule).
- Throttle key source `actor` works only on routes whose class guards include JwtAuthGuard.
- List pagination: `page` default 1, `pageSize` default 20 max 100, `meta {page,pageSize,total}`, strict query (README "List pagination convention").
- Scale-out: VersionCache, rate-limit store, TwoFactorChallengeStore and presence are in-memory (one replica only).
- After any `content/schemas` change, rerun `graphql:print-schema` (SDL `content/schema.graphql` is generated).

## User decisions in force
- Prettier defaults + singleQuote. Palette A, system font stack, no dark mode in v1, Button default variant secondary, dialog/form buttons secondary left, primary right, end-aligned.
- Env names are approved per task; names only in `.env.example`, values always from the user. Production secrets/keys (Cloudinary, Turnstile, SMTP) come from the user.
- Smoke-only overrides (rate limits, Turnstile test keys, Cloudinary dummies) live only in docker-compose.smoke.yml / the smoke build, never in production config.
- Shared smoke stack: one agent runs `pnpm smoke` at a time; no docker teardown without the manager's word; never touch any other docker stack.
- Sensitive fields (Q5): reference.phone, company (root + experience), github, email.
- Web: reader-only session sharing (privileged = any `/auth/me` permission whose action is not `read`); refused privileged sign-in calls logout best-effort. GraphQL: queries + document reads only, introspection off in production, limits in `GRAPHQL_LIMITS`.
- No write throttle in v1. Activity tracking = port with `none` adapter until the `database` adapter is scheduled.
- cv-page.json: do not edit until the CV page task returns (T30 skipped). Parked schema files stay in .claude/state/parked/.

## Gotchas
- Never delete anything (incl. gitignored dist/) without listing it for approval; rebuild over it instead.
- Never run any tool (incl. prettier) on a `.env*` path: check the path first.
- In zsh, `$VAR` holding several docker args is NOT word-split: pass args explicitly.
- Traefik routes a container only after it is healthy; until then /api falls through to the web (200 HTML). Smoke waits for the JSON body.
- cors sends `Access-Control-Allow-Credentials: true` even for disallowed origins (harmless: no ACAO).
- /auth/me re-reads the account itself: use a guard-only route to test VersionCache staleness.
- Express 5 query parser is `simple`: `filter[a][gte]=1` is one flat key (parse by key, no qs nesting).
- busboy `*Limit` events fire when the count reaches the limit: set limits one above what is allowed.
- `pnpm audit` known dev-only findings: sprintf-js (moderate), braces 3.0.3 (high, no patched release).
- CI: `.github/scripts/affected.test.sh` must pass after any change to `affected.sh` or workflow routing; no CI file may reference docker compose (`grep -rn compose .github`).
- Publish: Environment build args (VITE_API_BASE_URL, NEXT_PUBLIC_*) are read in `_publish.yml` image job via `vars`, never secrets; admin bundle check takes the full API base URL (`.github/scripts/bundle-check.sh <image> <url>`).
