# Conventions (read on demand)

Cross-cutting facts only. Do NOT read this whole file at start: grep the section you need (e.g. `grep -n -A3 -i prisma .claude/state/conventions.md`).
Module structure and API details: the module's README / `docs/modules/*.md`. Per-task history (T01-T34): grep `.claude/state/archive/conventions-archive.md` by task ID or area.

## Tooling
- Node 24.18 (`.nvmrc` = 24), pnpm 11.5.2, turbo 2.11.9. Root: `pnpm build|test|lint|typecheck` (turbo), `pnpm format` / `format:check`.
- TypeScript 6.0.3 per project (ADR 0001). NestJS pinned 11.2.7. Prisma 7.10.1 pinned (ignore the 8.0 rc). Kysely pinned 0.28.x (0.29+ is ESM-only and breaks the CJS build/ts-jest). graphql pinned 17.0.2.
- pnpm 11 minimumReleaseAge (1 day): pin versions released more than 1 day ago, else it writes `minimumReleaseAgeExclude` into pnpm-workspace.yaml. Stale lock entries: `pnpm clean --lockfile && pnpm install`. Lockfile is root pnpm-lock.yaml.
- `allowBuilds` in pnpm-workspace.yaml: install scripts default off; add new ones explicitly (`@prisma/engines`/`prisma` true, `argon2`/`esbuild` false).
- Per-project tooling: own tsconfig extending `../../tsconfig.base.json`, `eslint.config.mjs` and `oxlint.config.ts` from `@abyss/base-config` (base + local extend, D2), `.prettierrc.cjs` from `@abyss/base-config`. `@abyss/base-config` is built to `dist/` (D3, ESM, exports `types`/`import`/`default`): run `pnpm --filter @abyss/base-config build` once after a fresh clone, and before any editor ESLint/Prettier extension use. `lint` = `oxlint && eslint .`, exact-pinned devDeps; add the folder to `abyss.code-workspace`. tsconfig.base has `declaration: true`: set false in noEmit projects.
- Oxlint (1.88): only one of `.oxlintrc.json` / `oxlint.config.ts` per directory; `extends: [baseOxlint]` does not carry `plugins`, so set them per project; `oxlint.config.ts` is ignored by ESLint (base ignore). Config TS files load via Node type stripping (workspace symlink, not node_modules).
- `.prettierignore` skips `.claude/`, `SPEC.md`, `tasks/`, `CMS_*.html`, lockfile, `.next/`, `next-env.d.ts`. Leave `scripts/*.sh` out of prettier (no parser).
- a11y lint runs via oxlint `jsx-a11y` (eslint-plugin-jsx-a11y does not support ESLint 10). oxlint forbids conditional expect; prefers `<output>` over `role="status"`; copy keys must not start with `use` (react-hooks false positive).

## Testing & smoke
- cms-api Jest projects `unit` (src/**/*.spec.ts) + `integration` (test/integration, Testcontainers `postgres:16-alpine`, Docker must run). Jest needs `NODE_OPTIONS=--experimental-vm-modules` (set in scripts). Full parallel run can time out Testcontainers: use `--maxWorkers=2`; a single "ports not bound in 30 s" timeout: rerun before debugging.
- `createTestApp(env, overrides, testModules)` in `test/fixtures/test-app.ts` shares the real pipeline; `Clock` is the only time source (tests spyOn `app.get(Clock).now`). Test DB env: `dbEnvOf(url)` / `TEST_DB_ENV` in test/fixtures/env.fixture.ts.
- In Jest, fs errors and plain objects from other realms fail `instanceof` / plain-object checks: check structurally (`error.code`).
- eslint flags `expect.stringContaining` inside object literals (unsafe any): wrap in a helper returning `unknown`.
- Frontend tests: Vitest + jsdom, `src/**/*.test.tsx`; jsdom needs the ResizeObserver stub and the `<dialog>` polyfill (test/setup.ts); ProseMirror is driven through `element.editor`. form-commons must be rebuilt (`pnpm --filter @abyss/form-commons build`) before apps see new exports.
- `pnpm smoke` = scripts/smoke.sh (compose project `abyss-smoke`, port 8080, `SMOKE_KEEP=1` keeps the stack for browser checks; teardown `docker compose -p abyss-smoke down -v`). New cms-api env keys go into docker-compose.smoke.yml `cms-api.environment` (secrets generated in smoke.sh as SMOKE_*); new assertions use `request`/`expect_status`/`expect_header` and go into the matching `scripts/smoke/<group>.sh` (`check_<group>()`, called from smoke.sh in order).
- Test tiers (user decision 2026-10-25, skill `test-tiers`; commands and extra tier 3 paths in `project.md`): tier 1 unit + integration, tier 2 e2e on the dev stack, tier 3 smoke only for Docker/env/proxy/CORS/cookies/headers/cross-app/production-only changes and phase checks. Agent-local env lives in the gitignored, dockerignored `.localEnv.agent`.
- Iterate e2e with `pnpm e2e:spec <spec>` against a running stack (tier 3: `SMOKE_KEEP=1` writes the gitignored `.smoke/e2e-vars.sh`); a full `SMOKE_E2E=1 pnpm smoke` only at the start and end of a tier 3 unit. Specs share the stack's data and rate-limit counters between runs.
- e2e: `apps/e2e` (Playwright, Chromium in node_modules via `browsers:install`), run on the stack of the unit's tier; `workers: 1`. Rate-limit budget: owner login 4 of 5 per 15 min, request-otp 4 of 5 per IP across smoke + e2e: keep new specs within it. Seeded accounts: e2e-2fa, reader guests (E2E_READER_*, E2E_READER_2FA_*). Mailpit at mail.<SMOKE_DOMAIN>.
- Manual DevTools checks on a kept smoke stack: the owner password is never printed; set a known one (argon2 hash via `node -e` in the cms-api container, psql update in the db container) - only in the abyss-smoke stack.
- Component preview without an app: render with react-dom/server into scratchpad HTML + dist/styles.css, open via chrome-devtools MCP.
- CI has no e2e job (user decision, T37g): e2e runs locally only (`pnpm smoke`, `pnpm e2e:spec`). CI checks and publish run from `.github/` based on `.github_template/`. Static cms-api env is `scripts/stack/cms-api.env` (add new static cms-api settings there, not in the compose file). Lint workflows: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest`.

## Frontend
- cms-admin: `src/config/env.ts` is the only reader of `import.meta.env`; apps/web: `env.client.ts` reads literal `process.env.NEXT_PUBLIC_*` only, `env.server.ts` (`server-only`) validated at start by `instrumentation.ts`.
- All API paths in `src/config/endpoints.ts`; never send trailing slashes; copy: import `COPY` from `src/config/copy.constants.ts` (no i18n yet); sections are `config/copy/*.copy.ts`, joined in `copy/index.ts`, never imported directly (ESLint); new section = new file plus one line in the index; route paths in `src/config/routes.ts`.
- form-commons: tokens in `src/styles/tokens.css` (semantic shadcn names), shadcn via `pnpm --filter @abyss/form-commons exec shadcn add <x>`, pin exactly and restyle to semantic tokens. Dialogs = Radix `Dialog*` (footer `DialogClose` Cancel). `Button` has no default type: give non-submit buttons in forms `type="button"`. Router links: `<Button asChild variant="link">`.
- Admin tests use fake handlers keyed "METHOD /path" (`test/fake-api.ts`, createTestServices).
- apps/web `proxy.ts` `config.matcher` must be an inline static literal (Next rejects an imported constant); `next.config.ts` imports must stay import-free files (`security-headers.constants.ts`). cms-admin nginx headers come from `nginx/security-headers.inc.template` (envsubst, `CSP_CONNECT_SRC`); new nginx locations must include `security-headers.inc` (add_header is not inherited).
- Local `next build` of apps/web needs `NEXT_PUBLIC_API_BASE_URL` in the shell (agents never read .env.local).

- form-commons: a new input reuses `forms/field-wiring.ts` and `ui/control.constants.ts` (internal, `architecture.spec.ts` guards it); do not write bare class words (e.g. "ring") in kit comments, Tailwind scans sources (R3-16).
- form-commons table parts (`SortableSheet`, `TablePagination`, `BulkActionBar`) take all copy via `labels`; column renderers are named `renderCell` (oxlint no-unstable-nested-components flags `cell:`). Admin list copy is `COPY.content.collection` / `COPY.content.bulk`.
- cms-admin: features reach auth only through `features/auth` (`useCurrentUser`, `useSession`, `Session`); `auth/app-wiring.ts` is `src/app/**` only; no `app/` from features/lib (ESLint boundaries in `eslint.config.mjs`). Auth tests build their store with `auth-test-store.ts`.
- cms-admin: features import each other only via the other's `index.ts`, downward in the SPEC §2 order (`FEATURE_TIERS` in `eslint.config.mjs`); tests may deep-import for `vi.mock`. Architecture test is `src/architecture.test.ts` (vitest runs only `*.test.*`).
- cms-admin: shared page helpers live in `components/` (`useRestoreFocus`, `useClampedPage`) and `lib/date-format.ts` (no `new Intl.DateTimeFormat` elsewhere); query keys come from `*-queries.ts` / `use-setup-status.ts`, never literal `queryKey` arrays (ESLint `no-restricted-syntax`); the masked-value sentinel is `MASKED_VALUE`.
- cms-admin: feature constants live in `features/<x>/<x>.constants.ts` (R3-12); `config/` keeps env, endpoints, routes, http, auth; shared with copy go to `http.constants` (limits) or `auth.constants` (`REVIEWER_ROLE_SLUG`); ESLint bans importing another feature's constants file.
- cms-admin: a feature adds its pages and nav links in `features/<name>/feature.ts` plus one line in `features/registry.ts` (R3-09); a route is protected unless in `PUBLIC_ROUTE_PATHS` (`auth/feature.ts`); the `Feature` type is `lib/feature-definition.ts`.
- cms-admin: a feature API is registered with `apiServices: [defineApiService(createXApi, XApiProvider)]` in its `feature.ts` (R3-10); `createAppServices` returns `apiProviders`, no named `xApi` fields.
- apps/web: `config/**` may import pure `lib` helpers but not `lib/api-client` or features (ESLint, R3-15); error codes sit in the feature's constants file, `TURNSTILE` in `security.constants`; the reviewer API, query key and `useReviewerEnabled` live in `features/reviewer/reviewer.queries.ts`.

- Contract tests read `apps/cms-api/content/public-constants.json` with `readFileSync` from `process.cwd()` (never import it in app code); add a mirror check there when a client copies a new cms-api constant.

## Backend (cms-api)
- Errors: throw HttpException with `{ errorCode, message }`; the filter passes `details` for 4xx. Constants in `src/common/constants/*.constants.ts`; config via `APP_CONFIG` (src/config).
- Config log: `config/config-summary.ts` lists every logged field by hand; a new config field or env key needs a line there, a sentinel entry if secret (`config-summary.spec.ts`), and a `.env.example` entry (parity spec; CLI-only keys go on its allowlist).
- Express Request typing: use `RequestWithId` from request-id.middleware (module augmentation fails under pnpm strict).
- Content SQL names come only from `naming.ts` `planTables()`. Content reads go through `ContentDbProvider.db` (Kysely); controllers and DTOs must not import content.repository/tree-loader (architecture tests).
- Architecture specs use `src/architecture/import-graph.ts` (resolved files, facades followed), never path-string regexes.
- Every record body goes through `RecordSerializer` with `recordReadAccess(actor, fieldsFor().readable)`; writes: strip `version`, then `WriteAllowlist.apply`, then `assertTreeInput`. Rules: docs/modules/access-control.md.
- Token-accepting content routes: `@UseGuards(ApiTokenGuard, PermissionGuard)` (module imports AccessModule).
- Throttle key source `actor` works only on routes whose class guards include JwtAuthGuard.
- List pagination: `page` default 1, `pageSize` default 20 max 100, `meta {page,pageSize,total}`, strict query (README "List pagination convention").
- Scale-out: VersionCache, rate-limit store, TwoFactorChallengeStore and presence are in-memory (one replica only).
- After any `content/schemas` change, rerun `graphql:print-schema` (SDL `content/schema.graphql` is generated).

- Module graph guard: nodes and edges in `src/architecture/module-edges.constants.ts`; adding a module = one row in SPEC §2 plus one in `ALLOWED_MODULE_EDGES`; a removed violation must also leave `KNOWN_VIOLATIONS` (stale entries fail).

- cms-api: every module under `src/modules/` is imported only through its `index.ts` (lint-enforced in `apps/cms-api/eslint.config.mjs`; `access/management` has its own). Exceptions kept out of facades: `access/field-projection`, `access/document-auth`, `content-engine/content.repository`, `content-engine/tree-loader`. Never export loaders or raw audit writers from a facade. Run cms-api jest through `pnpm test:unit` (needs `--experimental-vm-modules`).
- A mirrored cms-api constant changes in `*.constants.ts`; then run `pnpm --filter @abyss/cms-api contract:print` and commit `content/public-constants.json` (CI runs `-- --check`). Client tests import the JSON; production code never does.

## User decisions in force
- Prettier defaults + singleQuote. Palette A, system font stack, no dark mode in v1, Button default variant secondary, dialog/form buttons secondary left, primary right, end-aligned.
- Env names are approved per task; names only in `.env.example`, values always from the user. Production secrets/keys (Cloudinary, Turnstile, SMTP) come from the user.
- Smoke-only overrides (rate limits, Turnstile test keys, Cloudinary dummies) live only in docker-compose.smoke.yml / the smoke build, never in production config.
- Shared smoke stack: one agent runs `pnpm smoke` at a time; no docker teardown without the manager's word; never touch any other docker stack.
- Sensitive fields (Q5): reference.phone, company (root + experience), github, email.
- Web: reader-only session sharing (privileged = any `/auth/me` permission whose action is not `read`); refused privileged sign-in calls logout best-effort. GraphQL: queries + document reads only, introspection off in production, limits in `GRAPHQL_LIMITS`.
- apps/web: features import each other only through `index.ts`; `session` is below `auth` and `reviewer`, which never import each other; `**/*test-utils*` only in `*.test.*` (eslint + `src/architecture.test.ts`).
- File granularity (2026-10-25): `code-standards` §4.4 and ADR 0006 §7.13. One file per use case, one ports and one constants file per module layer, no file under 30 lines, a new endpoint touches at most 6 files. Older audit target maps and CR file lists are superseded where they conflict; do not copy the finer split of already-moved modules.
- No write throttle in v1. Activity tracking = port with `none` adapter until the `database` adapter is scheduled.
- cv-page.json: do not edit until the CV page task returns (T30 skipped). Parked schema files stay in .claude/state/parked/.
- Owner creation (OS, ADR 0005): one-time `/setup` page, open only while no owner exists, guarded by a setup token from a k8s secret; after setup go to the login page (no direct sign-in). `owner:bootstrap` CLI stays as a fallback. displayName max 100 characters (setup route and CLI).
- Deploy (T37): one cms-api image, run as init (`deploy:migrate` = `db:migrate` then `content:migrate`, committed migrations only; CI fails on a missing migration via `content:generate --check`) and as main. docker-compose is for local testing only.
- CI (T37): triggers keep the template's branches (develop/staging/main), but never assume staging/develop exist. Actions are pinned to commit SHAs. Publish waits only for the app checks (not e2e, not the repo job). Agents never push.

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

- cms-api: unit conversions come only from `common/constants/time.constants.ts`; a literal 1000 in another `*.constants.ts` fails eslint (R2-15).
